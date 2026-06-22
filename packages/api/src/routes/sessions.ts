import { Router, type IRouter } from "express";
import type pg from "pg";
import { createCorrelator } from "../correlator.js";
import type { createLiveStream } from "../ws/live-stream.js";

type LiveStream = ReturnType<typeof createLiveStream>;

// Timeline display bounds — keep the response (and the N+1 fan-out it replaced)
// from loading an entire busy session into one payload. The accurate per-session
// totals come from the SQL aggregates, not the length of these display lists.
const TIMELINE_ACTION_LIMIT = 200; // max declared actions per page
const TIMELINE_EVENTS_PER_ACTION = 200; // top-confidence correlated events shown per action

const clampLimit = (raw: unknown, max: number): number => {
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : max;
};

const clampOffset = (raw: unknown): number => {
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

interface TimelineActionRow {
  id: string;
}

/**
 * Group a flat, per-action-capped event result set back onto its actions,
 * preserving action order and stripping the internal window-query columns
 * (`_action_id`, `_rn`). Pure — unit-tested directly.
 * @function groupEventsByAction
 * @param actions - the page of actions, in display order
 * @param eventRows - event rows tagged with `_action_id` (and `_rn`)
 * @returns one `{ action, events }` entry per action, events in query order
 */
export const groupEventsByAction = <A extends TimelineActionRow>(
  actions: readonly A[],
  eventRows: readonly Record<string, unknown>[]
): Array<{ action: A; events: Record<string, unknown>[] }> => {
  const byAction = new Map<string, Record<string, unknown>[]>();
  for (const row of eventRows) {
    const actionId = String(row._action_id);
    const { _action_id, _rn, ...event } = row;
    void _action_id;
    void _rn;
    (byAction.get(actionId) ?? byAction.set(actionId, []).get(actionId)!).push(event);
  }
  return actions.map((action) => ({ action, events: byAction.get(action.id) ?? [] }));
};

/**
 * Build the session routes (create/list/get/end/timeline) under /api/sessions.
 * Action routes live in createActionRouter (session-actions.ts).
 * @function createSessionsRouter
 * @param pool - Postgres pool
 * @param liveStream - WebSocket notifier for session/correlation events
 * @returns an Express router with the session routes
 */
export const createSessionsRouter = (pool: pg.Pool, liveStream: LiveStream): IRouter => {
  const router = Router();
  const correlator = createCorrelator(pool);

  // POST /api/sessions — create a new agent session
  router.post("/", async (req, res) => {
    try {
      const { agent_name, agent_pid, host_name, pod_name, metadata } = req.body;

      if (!agent_name || agent_pid == null) {
        res.status(400).json({ error: "agent_name and agent_pid are required" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO agent_sessions (agent_name, agent_pid, host_name, pod_name, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [agent_name, agent_pid, host_name ?? null, pod_name ?? null, JSON.stringify(metadata ?? {})]
      );

      const session = result.rows[0];
      liveStream.notifySessionStarted(session.id, agent_name, pod_name ?? null);

      res.status(201).json({ session });
    } catch (err) {
      console.error("Failed to create session:", err);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  // GET /api/sessions — list sessions
  router.get("/", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await pool.query(
        `SELECT s.*,
          (SELECT COUNT(*) FROM agent_actions WHERE session_id = s.id)::int AS action_count,
          (SELECT COUNT(*) FROM event_correlations ec
           JOIN agent_actions a ON ec.action_id = a.id
           WHERE a.session_id = s.id)::int AS event_count
         FROM agent_sessions s
         ORDER BY s.started_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      res.json({ sessions: result.rows });
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // GET /api/sessions/:id — get session detail
  router.get("/:id", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT s.*,
          (SELECT COUNT(*) FROM agent_actions WHERE session_id = s.id)::int AS action_count,
          (SELECT COUNT(*) FROM event_correlations ec
           JOIN agent_actions a ON ec.action_id = a.id
           WHERE a.session_id = s.id)::int AS event_count
         FROM agent_sessions s
         WHERE s.id = $1`,
        [req.params.id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      res.json({ session: result.rows[0] });
    } catch (err) {
      console.error("Failed to fetch session:", err);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // PATCH /api/sessions/:id/end — mark session as ended, batch re-correlate all actions
  router.patch("/:id/end", async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE agent_sessions SET ended_at = NOW()
         WHERE id = $1 AND ended_at IS NULL
         RETURNING *`,
        [req.params.id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Session not found or already ended" });
        return;
      }

      const session = result.rows[0];
      liveStream.notifySessionEnded(session.id, session.agent_name, session.pod_name);

      // Respond immediately — don't block on re-correlation
      res.json({ session });

      // Deferred batch re-correlate: wait for stragglers in the ingestion pipeline
      // Events travel: kernel -> Tetragon -> gRPC -> ingestion -> DB, which can lag 2-5s
      setTimeout(async () => {
        try {
          const actionsResult = await pool.query(
            "SELECT id FROM agent_actions WHERE session_id = $1 AND ended_at IS NOT NULL",
            [session.id]
          );

          for (const action of actionsResult.rows) {
            try {
              const corr = await correlator.correlateAction(action.id);
              liveStream.notifyCorrelation(session.id, corr);
            } catch {
              // Skip actions that fail correlation
            }
          }
          console.log(`Deferred re-correlation complete for session ${session.id.substring(0, 8)} (${actionsResult.rows.length} actions)`);
        } catch (err) {
          console.error("Deferred re-correlation failed:", err);
        }
      }, 3000);
    } catch (err) {
      console.error("Failed to end session:", err);
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  // GET /api/sessions/:id/timeline — full session timeline with correlated events
  router.get("/:id/timeline", async (req, res) => {
    try {
      // Fetch session
      const sessionResult = await pool.query(
        `SELECT s.*,
          (SELECT COUNT(*) FROM agent_actions WHERE session_id = s.id)::int AS action_count,
          (SELECT COUNT(*) FROM event_correlations ec
           JOIN agent_actions a ON ec.action_id = a.id
           WHERE a.session_id = s.id)::int AS event_count
         FROM agent_sessions s
         WHERE s.id = $1`,
        [req.params.id]
      );

      if (sessionResult.rows.length === 0) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // Page the actions (bounded) instead of loading every action for the session.
      const limit = clampLimit(req.query.limit, TIMELINE_ACTION_LIMIT);
      const offset = clampOffset(req.query.offset);
      const actionsResult = await pool.query(
        `SELECT * FROM agent_actions
         WHERE session_id = $1
         ORDER BY started_at ASC
         LIMIT $2 OFFSET $3`,
        [req.params.id, limit, offset]
      );
      const actions = actionsResult.rows;
      const actionIds = actions.map((a) => a.id);

      // One query (not N+1) for the page's correlated events, capped per action
      // via a window function so a single busy action can't dominate the payload.
      const eventsResult =
        actionIds.length === 0
          ? { rows: [] }
          : await pool.query(
              `SELECT * FROM (
                 SELECT e.*, ec.confidence, ec.correlation_method, ec.signal_scores, ec.action_id AS _action_id,
                   ROW_NUMBER() OVER (
                     PARTITION BY ec.action_id
                     ORDER BY ec.confidence DESC, COALESCE(e.event_time, e.created_at) ASC
                   ) AS _rn
                 FROM events e
                 JOIN event_correlations ec ON e.id = ec.event_id
                 WHERE ec.action_id = ANY($1::uuid[])
               ) ranked
               WHERE _rn <= $2`,
              [actionIds, TIMELINE_EVENTS_PER_ACTION]
            );

      const timeline = groupEventsByAction(actions, eventsResult.rows);

      res.json({
        session: sessionResult.rows[0],
        timeline,
        actions_total: sessionResult.rows[0].action_count,
        limit,
        offset,
      });
    } catch (err) {
      console.error("Failed to fetch timeline:", err);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  });

  return router;
};
