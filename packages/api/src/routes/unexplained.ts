import { Router, type IRouter } from "express";
import type pg from "pg";
import { DEFAULT_CORRELATION_CONFIG } from "../correlation/config.js";
import { parseActionHints } from "../correlation/action-parser.js";
import { declaredEgressDestinations } from "../correlation/egress.js";
import {
  createTriageAccumulator,
  type TriageReport,
  type TriageInputEvent,
} from "../correlation/triage.js";
import { profileFromEnv, type SensitivityProfile } from "../correlation/risk.js";

const MIN_THRESHOLD = 0;
const MAX_THRESHOLD = 1;
// Page size for streaming a session's events. Bounds API memory to one batch at
// a time (not the whole firehose) without changing the computed result — the
// triage accumulator runs the identical single-pass algorithm over the stream.
const EVENT_BATCH_SIZE = 5000;

/**
 * Parse the optional `threshold` query param.
 * @function parseThreshold
 * @param raw - The raw query value (string | string[] | undefined).
 * @returns The threshold, or null when present but not a number in [0,1].
 */
export const parseThreshold = (raw: unknown): number | null => {
  if (raw === undefined) return DEFAULT_CORRELATION_CONFIG.bands.high;
  const value = Number(raw);
  return Number.isFinite(value) && value >= MIN_THRESHOLD && value <= MAX_THRESHOLD ? value : null;
};

interface SessionScope {
  id: string;
  pod_name: string | null;
  agent_pid: number;
  started_at: string;
  ended_at: string;
}

/** The non-firehose triage inputs: the session scope, per-event best confidence, declared egress. */
export interface TriageContext {
  session: SessionScope;
  bestConfidence: Map<number, number>;
  declaredDestinations: string[];
}

/**
 * Load the bounded triage context for a session — its scope, each event's
 * strongest correlation confidence, and the destinations it declared. Reads only
 * the small tables (correlations/actions), NOT the event firehose (that is
 * streamed separately). Reads only; never writes.
 * @function loadTriageContext
 * @param pool - Postgres pool.
 * @param sessionId - The session to inspect.
 * @returns The context, or null when the session does not exist.
 */
export const loadTriageContext = async (
  pool: pg.Pool,
  sessionId: string
): Promise<TriageContext | null> => {
  const sessionResult = await pool.query(
    `SELECT id, pod_name, agent_pid, started_at, COALESCE(ended_at, NOW()) AS ended_at
     FROM agent_sessions WHERE id = $1`,
    [sessionId]
  );
  if (sessionResult.rows.length === 0) return null;
  const session = sessionResult.rows[0] as SessionScope;

  const correlationsResult = await pool.query(
    `SELECT ec.event_id, ec.confidence
     FROM event_correlations ec
     JOIN agent_actions a ON ec.action_id = a.id
     WHERE a.session_id = $1`,
    [sessionId]
  );
  const bestConfidence = new Map<number, number>();
  for (const c of correlationsResult.rows) {
    bestConfidence.set(c.event_id, Math.max(bestConfidence.get(c.event_id) ?? 0, c.confidence));
  }

  const actionsResult = await pool.query(
    `SELECT action_type, action_name, input_summary FROM agent_actions WHERE session_id = $1`,
    [sessionId]
  );
  const hints = actionsResult.rows.map((a) =>
    parseActionHints({
      action_type: a.action_type,
      action_name: a.action_name,
      input_summary: a.input_summary,
      agent_pid: session.agent_pid,
      pod_name: session.pod_name,
    })
  );

  return { session, bestConfidence, declaredDestinations: declaredEgressDestinations(hints) };
};

/**
 * Stream a session's events in time order via keyset pagination, invoking
 * `onEvent` for each. Holds only one page in memory at a time — the firehose is
 * never fully materialized. The ±1s window padding matches the engine's
 * candidate window (correlator.ts); the deterministic `(time, id)` order keeps
 * fd→path resolution stable.
 * @function streamSessionEvents
 * @param pool - Postgres pool.
 * @param session - The session scope (pod/pid + window).
 * @param onEvent - Called once per event, in time order.
 * @param batchSize - Rows per page (default {@link EVENT_BATCH_SIZE}).
 */
export const streamSessionEvents = async (
  pool: pg.Pool,
  session: SessionScope,
  onEvent: (event: TriageInputEvent) => void,
  batchSize: number = EVENT_BATCH_SIZE
): Promise<void> => {
  const filter = session.pod_name ? "pod_name = $1" : "process_pid = $1";
  const key = session.pod_name ?? session.agent_pid;
  let cursor: { t: string; id: number } | null = null;

  for (;;) {
    const params: unknown[] = [key, session.started_at, session.ended_at];
    let keyset = "";
    if (cursor) {
      params.push(cursor.t, cursor.id);
      keyset = ` AND (COALESCE(event_time, created_at), id) > ($${params.length - 1}::timestamptz, $${params.length}::int)`;
    }
    params.push(batchSize);
    const result = await pool.query(
      `SELECT id, event_type, function_name, process_pid, process_binary, event_time, created_at, raw_event
       FROM events
       WHERE ${filter}
         AND COALESCE(event_time, created_at) >= ($2::timestamptz - interval '1 second')
         AND COALESCE(event_time, created_at) <= ($3::timestamptz + interval '1 second')${keyset}
       ORDER BY COALESCE(event_time, created_at) ASC, id ASC
       LIMIT $${params.length}`,
      params
    );
    for (const row of result.rows) onEvent(row as TriageInputEvent);
    if (result.rows.length < batchSize) break;
    const last = result.rows[result.rows.length - 1] as { id: number; event_time: string | null; created_at: string };
    cursor = { t: last.event_time ?? last.created_at, id: last.id };
  }
};

/**
 * Build a session's triage report by streaming its events through the triage
 * accumulator — bounded memory, identical result to the batch builder.
 * @function buildSessionTriage
 * @param pool - Postgres pool.
 * @param sessionId - The session to inspect.
 * @param threshold - Confidence at/above which an event counts as explained.
 * @param profile - The active sensitivity profile.
 * @returns The triage report, or null when the session does not exist.
 */
export const buildSessionTriage = async (
  pool: pg.Pool,
  sessionId: string,
  threshold: number,
  profile: SensitivityProfile
): Promise<TriageReport | null> => {
  const ctx = await loadTriageContext(pool, sessionId);
  if (ctx === null) return null;
  const acc = createTriageAccumulator({
    bestConfidence: ctx.bestConfidence,
    threshold,
    declaredDestinations: ctx.declaredDestinations,
    profile,
  });
  await streamSessionEvents(pool, ctx.session, (e) => acc.push(e));
  return acc.report();
};

/**
 * Router for unexplained-behaviour triage — per-session coverage score + a
 * risk-ranked feed of events no reported action explains. Reads existing tables only.
 * @function createUnexplainedRouter
 * @param pool - Postgres pool for session/event/correlation/action queries.
 */
export const createUnexplainedRouter = (pool: pg.Pool): IRouter => {
  const router = Router();

  // GET /api/sessions/:id/unexplained — coverage + risk-ranked unexplained feed
  router.get("/:id/unexplained", async (req, res) => {
    try {
      const threshold = parseThreshold(req.query.threshold);
      if (threshold === null) {
        res.status(400).json({ error: "threshold must be a number in [0, 1]" });
        return;
      }

      // Conservative profile by default; the demo opts into private-mesh de-noise
      // via ARGUS_SENSITIVITY_PROFILE=demo (link-local/public egress stay HIGH).
      const report = await buildSessionTriage(pool, req.params.id, threshold, profileFromEnv());
      if (report === null) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      res.json({ threshold, ...report });
    } catch (err) {
      console.error("Failed to build unexplained triage report:", err);
      res.status(500).json({ error: "Failed to build unexplained triage report" });
    }
  });

  return router;
};
