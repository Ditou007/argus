import { Router, type IRouter } from "express";
import type pg from "pg";
import { createCorrelator } from "../correlator.js";

export const createSessionsRouter = (pool: pg.Pool): IRouter => {
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

      res.status(201).json({ session: result.rows[0] });
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

  // PATCH /api/sessions/:id/end — mark session as ended
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

      res.json({ session: result.rows[0] });
    } catch (err) {
      console.error("Failed to end session:", err);
      res.status(500).json({ error: "Failed to end session" });
    }
  });

  // POST /api/sessions/:id/actions — create an action within a session
  router.post("/:id/actions", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const { action_type, action_name, input_summary, metadata, started_at } = req.body;

      if (!action_type) {
        res.status(400).json({ error: "action_type is required" });
        return;
      }

      const result = await pool.query(
        `INSERT INTO agent_actions (session_id, action_type, action_name, input_summary, metadata, started_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          sessionId,
          action_type,
          action_name ?? null,
          input_summary ?? null,
          JSON.stringify(metadata ?? {}),
          started_at ?? new Date().toISOString(),
        ]
      );

      res.status(201).json({ action: result.rows[0] });
    } catch (err) {
      console.error("Failed to create action:", err);
      res.status(500).json({ error: "Failed to create action" });
    }
  });

  // PATCH /api/actions/:id/end — end an action and trigger correlation
  router.patch("/actions/:id/end", async (req, res) => {
    try {
      const { output_summary } = req.body;

      const result = await pool.query(
        `UPDATE agent_actions SET ended_at = NOW(), output_summary = COALESCE($2, output_summary)
         WHERE id = $1 AND ended_at IS NULL
         RETURNING *`,
        [req.params.id, output_summary ?? null]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Action not found or already ended" });
        return;
      }

      const action = result.rows[0];

      // Trigger correlation
      const correlation = await correlator.correlateAction(action.id);

      res.json({ action, correlation });
    } catch (err) {
      console.error("Failed to end action:", err);
      res.status(500).json({ error: "Failed to end action" });
    }
  });

  // POST /api/actions/:id/correlate — manually re-correlate an action
  router.post("/actions/:id/correlate", async (req, res) => {
    try {
      const correlation = await correlator.correlateAction(req.params.id);
      res.json({ correlation });
    } catch (err) {
      console.error("Failed to correlate action:", err);
      res.status(500).json({ error: "Failed to correlate action" });
    }
  });

  // GET /api/actions/:id/events — get correlated events for an action
  router.get("/actions/:id/events", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT e.*, ec.confidence, ec.correlation_method
         FROM events e
         JOIN event_correlations ec ON e.id = ec.event_id
         WHERE ec.action_id = $1
         ORDER BY e.created_at ASC`,
        [req.params.id]
      );

      res.json({ events: result.rows });
    } catch (err) {
      console.error("Failed to fetch action events:", err);
      res.status(500).json({ error: "Failed to fetch action events" });
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

      // Fetch all actions for this session
      const actionsResult = await pool.query(
        `SELECT * FROM agent_actions
         WHERE session_id = $1
         ORDER BY started_at ASC`,
        [req.params.id]
      );

      // Fetch correlated events for each action
      const timeline = await Promise.all(
        actionsResult.rows.map(async (action) => {
          const eventsResult = await pool.query(
            `SELECT e.*, ec.confidence, ec.correlation_method
             FROM events e
             JOIN event_correlations ec ON e.id = ec.event_id
             WHERE ec.action_id = $1
             ORDER BY e.created_at ASC`,
            [action.id]
          );

          return {
            action,
            events: eventsResult.rows,
          };
        })
      );

      res.json({
        session: sessionResult.rows[0],
        timeline,
      });
    } catch (err) {
      console.error("Failed to fetch timeline:", err);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  });

  return router;
};
