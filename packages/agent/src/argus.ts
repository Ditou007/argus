import { hostname } from "node:os";
import type { DeclaredAction } from "./loop.js";
import type { Logger } from "./logger.js";

/**
 * Argus SDK client (I/O at the edge): reports the agent session and wraps
 * declared actions around real work via the Argus API. Matches the same
 * /api/sessions + /actions contract the Python SDK uses. A failed report is
 * logged and swallowed — instrumentation must never break the agent.
 */

const REQUEST_TIMEOUT_MS = 5000;

interface ArgusClientOptions {
  readonly apiUrl: string;
  readonly agentName: string;
  readonly log: Logger;
}

const postJson = async (url: string, body: unknown): Promise<unknown> => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return res.json();
};

const patchJson = async (url: string, body: unknown): Promise<void> => {
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
};

export interface ArgusClient {
  start: () => Promise<void>;
  /** Wrap `run` in a declared action (start before, end after); returns run's result. */
  declare: <T>(action: DeclaredAction, run: () => Promise<T>) => Promise<T>;
  end: () => Promise<void>;
}

/** Log + swallow an instrumentation error; reporting must never break the agent. */
const swallow = (log: Logger, event: string, err: unknown): void =>
  log.error(event, { error: err instanceof Error ? err.message : String(err) });

/**
 * Build the Argus SDK client: reports the agent session and wraps declared
 * actions around real work via the Argus API.
 * @function createArgusClient
 * @param options - API URL, agent name, and logger.
 * @returns A client with start/declare/end.
 */
export const createArgusClient = (options: ArgusClientOptions): ArgusClient => {
  const { apiUrl, agentName, log } = options;
  // pid:host (compose) → process.pid IS the host PID Tetragon captures.
  const agentPid = process.pid;
  // Blank in compose (ARGUS_POD_NAME="") so correlation keys on the host PID.
  const podName = process.env.ARGUS_POD_NAME || null;
  let sessionId: number | null = null;

  // Start a declared action; returns its id, or null if the report failed.
  const startAction = async (action: DeclaredAction): Promise<number | null> => {
    try {
      const result = (await postJson(`${apiUrl}/api/sessions/${sessionId}/actions`, {
        action_type: action.type,
        action_name: action.name,
        input_summary: action.input,
        started_at: new Date().toISOString(),
      })) as { action?: { id: number } };
      return result.action?.id ?? null;
    } catch (err) {
      swallow(log, "argus_action_start_failed", err);
      return null;
    }
  };

  // End a declared action (triggers correlation server-side).
  const endAction = async (actionId: number, output: unknown): Promise<void> => {
    try {
      await patchJson(`${apiUrl}/api/sessions/actions/${actionId}/end`, {
        output_summary: typeof output === "string" ? output.slice(0, 500) : null,
      });
    } catch (err) {
      swallow(log, "argus_action_end_failed", err);
    }
  };

  const start = async (): Promise<void> => {
    try {
      const result = (await postJson(`${apiUrl}/api/sessions`, {
        agent_name: agentName,
        agent_pid: agentPid,
        host_name: hostname(),
        pod_name: podName,
        metadata: { runtime: "node", kind: "demo-chatbot" },
      })) as { session?: { id: number } };
      sessionId = result.session?.id ?? null;
      log.info("argus_session_started", { sessionId, agentPid });
    } catch (err) {
      swallow(log, "argus_session_start_failed", err);
    }
  };

  const declare = async <T>(action: DeclaredAction, run: () => Promise<T>): Promise<T> => {
    if (sessionId === null) return run();
    const actionId = await startAction(action);
    const output = await run();
    if (actionId !== null) await endAction(actionId, output);
    return output;
  };

  const end = async (): Promise<void> => {
    if (sessionId === null) return;
    try {
      await patchJson(`${apiUrl}/api/sessions/${sessionId}/end`, {});
      log.info("argus_session_ended", { sessionId });
    } catch (err) {
      swallow(log, "argus_session_end_failed", err);
    }
  };

  return { start, declare, end };
};
