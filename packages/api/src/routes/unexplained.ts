import { Router, type IRouter } from "express";
import type pg from "pg";
import { detectUnexplained } from "../correlation/unexplained.js";
import { DEFAULT_CORRELATION_CONFIG } from "../correlation/config.js";

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

/**
 * Find the events in a session that no reported action explains at `threshold`.
 * Reads existing tables only; never writes. Returns null if the session is unknown.
 * @function findUnexplainedEvents
 * @param pool - Postgres pool.
 * @param sessionId - The session to inspect.
 * @param threshold - Confidence at or above which an event counts as explained.
 * @returns The unexplained event rows, or null when the session does not exist.
 */
export const findUnexplainedEvents = async (
  pool: pg.Pool,
  sessionId: string,
  threshold: number
): Promise<Record<string, unknown>[] | null> => {
  const sessionResult = await pool.query(
    `SELECT id, pod_name, agent_pid, started_at, COALESCE(ended_at, NOW()) AS ended_at
     FROM agent_sessions WHERE id = $1`,
    [sessionId]
  );
  if (sessionResult.rows.length === 0) return null;
  const session = sessionResult.rows[0];

  // All events observed in the session's pod (or PID) during its window, padded
  // by ±1s to match the engine's per-action candidate window (correlator.ts) so
  // no event the engine could have correlated is dropped from the population.
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

  // The strongest correlation confidence each event reached against any action
  const correlationsResult = await pool.query(
    `SELECT ec.event_id, ec.confidence
     FROM event_correlations ec
     JOIN agent_actions a ON ec.action_id = a.id
     WHERE a.session_id = $1`,
    [sessionId]
  );

  const unexplainedIds = new Set(
    detectUnexplained(eventsResult.rows.map((e) => e.id), correlationsResult.rows, threshold)
  );
  return eventsResult.rows.filter((e) => unexplainedIds.has(e.id));
};

/**
 * Router for unexplained-behaviour detection — events in a session that no
 * reported action accounts for. Additive surface; reads existing tables only.
 * @function createUnexplainedRouter
 * @param pool - Postgres pool for session/event/correlation queries.
 */
export const createUnexplainedRouter = (pool: pg.Pool): IRouter => {
  const router = Router();

  // GET /api/sessions/:id/unexplained — events the session's actions don't explain
  router.get("/:id/unexplained", async (req, res) => {
    try {
      const threshold = parseThreshold(req.query.threshold);
      if (threshold === null) {
        res.status(400).json({ error: "threshold must be a number in [0, 1]" });
        return;
      }

      const events = await findUnexplainedEvents(pool, req.params.id, threshold);
      if (events === null) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      res.json({ threshold, unexplained_count: events.length, events });
    } catch (err) {
      console.error("Failed to detect unexplained events:", err);
      res.status(500).json({ error: "Failed to detect unexplained events" });
    }
  });

  return router;
};
