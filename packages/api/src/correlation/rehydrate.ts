import type pg from "pg";
import type { ActionScopeInput } from "./streaming-service.js";

/** The subset of the streaming service rehydrate needs — re-opening windows. */
export interface WindowOpener {
  openAction: (actionId: string, scope: ActionScopeInput, startedAt: Date) => void;
}

/**
 * Rebuild the streaming correlator's open windows after a restart: every action
 * still open in Postgres (no ended_at) gets its window re-opened with the
 * session's scope + start time, so events arriving after the restart attribute
 * and the action still closes into a trace. Call before the stream consumer
 * starts. (Events acked before the restart are not re-accumulated — full
 * event-replay needs the stable event id from Slice 3.)
 * @function rehydrateWindows
 * @param pool - Postgres pool
 * @param service - the streaming service (openAction)
 * @returns the number of windows re-opened
 */
export const rehydrateWindows = async (pool: pg.Pool, service: WindowOpener): Promise<number> => {
  const result = await pool.query(
    `SELECT a.id, a.started_at, s.pod_name, s.agent_pid
     FROM agent_actions a
     JOIN agent_sessions s ON a.session_id = s.id
     WHERE a.ended_at IS NULL`
  );
  for (const row of result.rows) {
    service.openAction(
      row.id,
      { pod_name: row.pod_name ?? null, agent_pid: row.agent_pid },
      new Date(row.started_at)
    );
  }
  return result.rows.length;
};
