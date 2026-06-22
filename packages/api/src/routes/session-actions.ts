import { Router, type IRouter, type RequestHandler } from "express";
import type pg from "pg";
import { createCorrelator } from "../correlator.js";
import type { createLiveStream } from "../ws/live-stream.js";
import type { createStreamingService } from "../correlation/streaming-service.js";

type LiveStream = ReturnType<typeof createLiveStream>;
type StreamingService = ReturnType<typeof createStreamingService>;
type Correlator = ReturnType<typeof createCorrelator>;

interface ActionDeps {
  pool: pg.Pool;
  liveStream: LiveStream;
  correlator: Correlator;
  streaming?: StreamingService;
}

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// The session's correlation scope (pod when present, else host PID). Returns
// null when the session row is absent — callers then skip streaming work rather
// than fabricate a PID-0 scope (which would mis-attribute to the kernel idle task).
const sessionScope = async (
  pool: pg.Pool,
  sessionId: string
): Promise<{ pod_name: string | null; agent_pid: number } | null> => {
  const result = await pool.query("SELECT pod_name, agent_pid FROM agent_sessions WHERE id = $1", [sessionId]);
  const row = result.rows[0];
  if (!row) return null;
  return { pod_name: row.pod_name ?? null, agent_pid: row.agent_pid };
};

// Normalize the request body into positional INSERT values (keeps the handler
// under the complexity limit by moving the null-coalescing here).
const actionInsertValues = (sessionId: string, body: Record<string, unknown>): unknown[] => [
  sessionId,
  body.action_type,
  body.action_name ?? null,
  body.input_summary ?? null,
  JSON.stringify(body.metadata ?? {}),
  body.started_at ?? new Date().toISOString(),
];

const createAction = (deps: ActionDeps): RequestHandler => async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { action_type, action_name } = req.body;
    if (!action_type) {
      res.status(400).json({ error: "action_type is required" });
      return;
    }

    const result = await deps.pool.query(
      `INSERT INTO agent_actions (session_id, action_type, action_name, input_summary, metadata, started_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      actionInsertValues(sessionId, req.body)
    );
    const action = result.rows[0];

    const scope = await sessionScope(deps.pool, sessionId);
    deps.liveStream.notifyActionStarted(action.id, sessionId, action_type, action_name ?? null, scope?.pod_name ?? null);
    // SPEC_04: open a streaming-correlation window so events are accumulated as
    // they stream in (no end-of-action batch-query race). Skip if scope is unresolved.
    if (scope) {
      deps.streaming?.openAction(action.id, scope, new Date(action.started_at));
    }

    res.status(201).json({ action });
  } catch (err) {
    console.error("Failed to create action:", err);
    res.status(500).json({ error: "Failed to create action" });
  }
};

const finalizeStreamingTrace = (deps: ActionDeps, action: Record<string, unknown>): void => {
  if (!deps.streaming) return;
  const streaming = deps.streaming;
  // Additive: a streaming/ClickHouse failure must not break ending the action.
  sessionScope(deps.pool, String(action.session_id))
    .then((scope) =>
      scope
        ? streaming.closeAction({
            action_id: String(action.id),
            session_id: String(action.session_id),
            action_type: String(action.action_type),
            action_name: (action.action_name as string | null) ?? null,
            input_summary: (action.input_summary as string | null) ?? null,
            agent_pid: scope.agent_pid,
            pod_name: scope.pod_name,
            ended_at: new Date(action.ended_at as string),
          })
        : null
    )
    .catch((err: unknown) => console.error("Streaming trace persist failed:", describeError(err)));
};

const endAction = (deps: ActionDeps): RequestHandler => async (req, res) => {
  try {
    const { output_summary } = req.body;
    const result = await deps.pool.query(
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

    // On-demand Postgres correlation (unchanged), then the additive streaming trace.
    const correlation = await deps.correlator.correlateAction(action.id);
    deps.liveStream.notifyActionEnded(action.id, action.session_id, action.action_type, action.action_name);
    deps.liveStream.notifyCorrelation(action.session_id, correlation);
    finalizeStreamingTrace(deps, action);

    res.json({ action, correlation });
  } catch (err) {
    console.error("Failed to end action:", err);
    res.status(500).json({ error: "Failed to end action" });
  }
};

const correlateAction = (deps: ActionDeps): RequestHandler => async (req, res) => {
  try {
    const correlation = await deps.correlator.correlateAction(req.params.id);
    res.json({ correlation });
  } catch (err) {
    console.error("Failed to correlate action:", err);
    res.status(500).json({ error: "Failed to correlate action" });
  }
};

const actionEvents = (deps: ActionDeps): RequestHandler => async (req, res) => {
  try {
    const result = await deps.pool.query(
      `SELECT e.*, ec.confidence, ec.correlation_method, ec.signal_scores
       FROM events e
       JOIN event_correlations ec ON e.id = ec.event_id
       WHERE ec.action_id = $1
       ORDER BY ec.confidence DESC, COALESCE(e.event_time, e.created_at) ASC`,
      [req.params.id]
    );
    res.json({ events: result.rows });
  } catch (err) {
    console.error("Failed to fetch action events:", err);
    res.status(500).json({ error: "Failed to fetch action events" });
  }
};

/**
 * Build the action routes (create/end/correlate/events) under /api/sessions.
 * The end route additionally finalizes the SPEC_04 streaming trace to ClickHouse.
 * @function createActionRouter
 * @param pool - Postgres pool
 * @param liveStream - WebSocket notifier
 * @param streaming - optional streaming-correlation service (opens/closes windows)
 * @returns an Express router with the action routes
 */
export const createActionRouter = (
  pool: pg.Pool,
  liveStream: LiveStream,
  streaming?: StreamingService
): IRouter => {
  const router = Router();
  const deps: ActionDeps = { pool, liveStream, correlator: createCorrelator(pool), streaming };
  router.post("/:id/actions", createAction(deps));
  router.patch("/actions/:id/end", endAction(deps));
  router.post("/actions/:id/correlate", correlateAction(deps));
  router.get("/actions/:id/events", actionEvents(deps));
  return router;
};
