import { Router, type IRouter } from "express";
import type pg from "pg";
import { detectUnexplained } from "../correlation/unexplained.js";
import { DEFAULT_CORRELATION_CONFIG } from "../correlation/config.js";
import { parseActionHints } from "../correlation/action-parser.js";
import { declaredEgressDestinations } from "../correlation/egress.js";
import { buildTriageReport, type TriageReport, type TriageInputEvent } from "../correlation/triage.js";
import { profileFromEnv } from "../correlation/risk.js";

const MIN_THRESHOLD = 0;
const MAX_THRESHOLD = 1;

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

type EventRow = TriageInputEvent;

/**
 * Load everything the triage report needs for a session: every event in its
 * window, the unexplained subset, each event's strongest correlation, and the
 * destinations the agent declared. Reads existing tables only; never writes.
 * @function loadUnexplainedData
 * @param pool - Postgres pool.
 * @param sessionId - The session to inspect.
 * @param threshold - Confidence at or above which an event counts as explained.
 * @returns The loaded data, or null when the session does not exist.
 */
export const loadUnexplainedData = async (
  pool: pg.Pool,
  sessionId: string,
  threshold: number
): Promise<{
  allEvents: EventRow[];
  unexplainedIds: Set<number>;
  bestConfidence: Map<number, number>;
  declaredDestinations: string[];
} | null> => {
  const sessionResult = await pool.query(
    `SELECT id, pod_name, agent_pid, started_at, COALESCE(ended_at, NOW()) AS ended_at
     FROM agent_sessions WHERE id = $1`,
    [sessionId]
  );
  if (sessionResult.rows.length === 0) return null;
  const session = sessionResult.rows[0];

  // All events observed in the session's pod (or PID) during its window, padded
  // by ±1s to match the engine's per-action candidate window (correlator.ts).
  const filter = session.pod_name ? "pod_name = $1" : "process_pid = $1";
  const key = session.pod_name ?? session.agent_pid;
  const eventsResult = await pool.query(
    `SELECT id, event_type, function_name, process_pid, process_binary, event_time, created_at, raw_event
     FROM events
     WHERE ${filter}
       AND COALESCE(event_time, created_at) >= ($2::timestamptz - interval '1 second')
       AND COALESCE(event_time, created_at) <= ($3::timestamptz + interval '1 second')
     ORDER BY COALESCE(event_time, created_at) ASC`,
    [key, session.started_at, session.ended_at]
  );

  const correlationsResult = await pool.query(
    `SELECT ec.event_id, ec.confidence
     FROM event_correlations ec
     JOIN agent_actions a ON ec.action_id = a.id
     WHERE a.session_id = $1`,
    [sessionId]
  );

  const actionsResult = await pool.query(
    `SELECT action_type, action_name, input_summary FROM agent_actions WHERE session_id = $1`,
    [sessionId]
  );

  const allEvents = eventsResult.rows as EventRow[];
  const bestConfidence = new Map<number, number>();
  for (const c of correlationsResult.rows) {
    bestConfidence.set(c.event_id, Math.max(bestConfidence.get(c.event_id) ?? 0, c.confidence));
  }
  const unexplainedIds = new Set(
    detectUnexplained(allEvents.map((e) => e.id), correlationsResult.rows, threshold)
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

  return { allEvents, unexplainedIds, bestConfidence, declaredDestinations: declaredEgressDestinations(hints) };
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

      const data = await loadUnexplainedData(pool, req.params.id, threshold);
      if (data === null) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // Conservative profile by default; the demo opts into private-mesh de-noise
      // via ARGUS_SENSITIVITY_PROFILE=demo (link-local/public egress stay HIGH).
      const report: TriageReport = buildTriageReport({ ...data, profile: profileFromEnv() });
      res.json({ threshold, ...report });
    } catch (err) {
      console.error("Failed to build unexplained triage report:", err);
      res.status(500).json({ error: "Failed to build unexplained triage report" });
    }
  });

  return router;
};
