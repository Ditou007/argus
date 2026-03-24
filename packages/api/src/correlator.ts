import type pg from "pg";

interface CorrelationResult {
  action_id: string;
  events_correlated: number;
  direct_matches: number;
  child_matches: number;
  method: "pod_exact" | "pid_exact" | "none";
}

export const createCorrelator = (pool: pg.Pool) => {
  const correlateAction = async (actionId: string): Promise<CorrelationResult> => {
    // Fetch the action and its session to get PID + pod_name + time window
    const actionResult = await pool.query(
      `SELECT a.id, a.started_at, a.ended_at, s.agent_pid, s.pod_name
       FROM agent_actions a
       JOIN agent_sessions s ON a.session_id = s.id
       WHERE a.id = $1`,
      [actionId]
    );

    if (actionResult.rows.length === 0) {
      throw new Error(`Action not found: ${actionId}`);
    }

    const action = actionResult.rows[0];

    if (!action.ended_at) {
      throw new Error(`Action not yet ended: ${actionId}`);
    }

    // Clear any previous correlations for this action (for re-correlation)
    await pool.query("DELETE FROM event_correlations WHERE action_id = $1", [actionId]);

    // --- Pod-based correlation (K8s mode) ---
    // Preferred: pod_name is globally unique within the cluster
    // Use event_time (actual kernel timestamp) instead of created_at (DB insert time)
    // because gRPC ingestion can have seconds of delay
    if (action.pod_name) {
      const podEvents = await pool.query(
        `SELECT id FROM events
         WHERE pod_name = $1
           AND COALESCE(event_time, created_at) >= $2
           AND COALESCE(event_time, created_at) <= $3`,
        [action.pod_name, action.started_at, action.ended_at]
      );

      let count = 0;
      for (const row of podEvents.rows) {
        await pool.query(
          `INSERT INTO event_correlations (action_id, event_id, confidence, correlation_method)
           VALUES ($1, $2, 1.0, 'pod_exact')`,
          [actionId, row.id]
        );
        count++;
      }

      return {
        action_id: actionId,
        events_correlated: count,
        direct_matches: count,
        child_matches: 0,
        method: "pod_exact",
      };
    }

    // --- PID-based correlation (docker-compose fallback) ---
    // Match events by direct PID + time window
    const directEvents = await pool.query(
      `SELECT id FROM events
       WHERE process_pid = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [action.agent_pid, action.started_at, action.ended_at]
    );

    let directCount = 0;
    for (const row of directEvents.rows) {
      await pool.query(
        `INSERT INTO event_correlations (action_id, event_id, confidence, correlation_method)
         VALUES ($1, $2, 1.0, 'pid_exact')`,
        [actionId, row.id]
      );
      directCount++;
    }

    // Match child process events (parent PID matches agent PID within time window)
    const childEvents = await pool.query(
      `SELECT id FROM events
       WHERE process_pid != $1
         AND created_at >= $2
         AND created_at <= $3
         AND raw_event->'process_exec'->'parent'->>'pid' = $4`,
      [
        action.agent_pid,
        action.started_at,
        action.ended_at,
        String(action.agent_pid),
      ]
    );

    let childCount = 0;
    for (const row of childEvents.rows) {
      await pool.query(
        `INSERT INTO event_correlations (action_id, event_id, confidence, correlation_method)
         VALUES ($1, $2, 0.8, 'child_pid')`,
        [actionId, row.id]
      );
      childCount++;
    }

    return {
      action_id: actionId,
      events_correlated: directCount + childCount,
      direct_matches: directCount,
      child_matches: childCount,
      method: directCount + childCount > 0 ? "pid_exact" : "none",
    };
  };

  return { correlateAction };
};
