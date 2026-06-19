import type pg from "pg";
import type { CorrelationResult, EventCandidate } from "./types.js";
import { parseActionHints } from "./action-parser.js";
import { resolveFdPaths, injectResolvedPath } from "./fd-path.js";
import { createDnsCache } from "./dns-cache.js";
import { createSignalRegistry } from "./signal-registry.js";
import { DEFAULT_CORRELATION_CONFIG, type CorrelationConfig } from "./config.js";

const dnsCache = createDnsCache();

const CANDIDATE_COLUMNS = `id, event_type, process_pid, process_binary, function_name,
                event_time, created_at, raw_event`;

export interface CandidateAction {
  readonly pod_name: string | null;
  readonly agent_pid: number;
  readonly started_at: string;
  readonly ended_at: string;
}

/**
 * Build the candidate-event query: by pod when the action has one, else by PID.
 * Both widen the action window by ±1s to tolerate ingestion/clock skew.
 *
 * The PID branch is the compose-mode (pid:host) discriminator: with no pod
 * metadata, only events from the agent's own host PID are candidates — a syscall
 * from a different host process is excluded here, before scoring.
 * @function buildCandidateQuery
 * @param action - The declared action's pod/PID identity and time window.
 * @returns Parameterized SQL text and its bound values.
 */
export const buildCandidateQuery = (action: CandidateAction): { text: string; values: unknown[] } => {
  const filter = action.pod_name ? "pod_name = $1" : "process_pid = $1";
  const key = action.pod_name ?? action.agent_pid;
  const text = `SELECT ${CANDIDATE_COLUMNS}
         FROM events
         WHERE ${filter}
           AND COALESCE(event_time, created_at) >= ($2::timestamptz - interval '1 second')
           AND COALESCE(event_time, created_at) <= ($3::timestamptz + interval '1 second')
         ORDER BY COALESCE(event_time, created_at) ASC
         LIMIT 500`;
  return { text, values: [key, action.started_at, action.ended_at] };
};

/**
 * Build the DB-backed correlator. Fetches candidate events for an action and
 * scores them through the signal registry bound to `config`.
 * @function createCorrelator
 * @param pool - Postgres pool for action/event queries.
 * @param config - Engine weights/thresholds; defaults to the shipped constants.
 */
export const createCorrelator = (pool: pg.Pool, config: CorrelationConfig = DEFAULT_CORRELATION_CONFIG) => {
  const registry = createSignalRegistry(config);

  const correlateAction = async (actionId: string): Promise<CorrelationResult> => {
    // 1. Fetch action + session
    const actionResult = await pool.query(
      `SELECT a.id, a.action_type, a.action_name, a.input_summary,
              a.started_at, a.ended_at, s.agent_pid, s.pod_name
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

    // 2. Parse action hints (extract URLs, file paths, expected functions)
    const hints = parseActionHints({
      action_type: action.action_type,
      action_name: action.action_name,
      input_summary: action.input_summary,
      agent_pid: action.agent_pid,
      pod_name: action.pod_name,
    });

    // 3. Resolve DNS for hostnames
    if (hints.expected_hostnames.length > 0) {
      hints.expected_ips = await dnsCache.resolveAll(hints.expected_hostnames);
    }

    // 4. Fetch candidate events (wider window: +/- 1 second padding)
    const candidateQuery = buildCandidateQuery(action);
    const candidateResult = await pool.query(candidateQuery.text, candidateQuery.values);

    const candidates: EventCandidate[] = candidateResult.rows.map((row) => ({
      id: row.id,
      event_type: row.event_type,
      process_pid: row.process_pid,
      process_binary: row.process_binary,
      function_name: row.function_name,
      event_time: row.event_time ? new Date(row.event_time) : null,
      created_at: new Date(row.created_at),
      raw_event: typeof row.raw_event === "string" ? JSON.parse(row.raw_event) : row.raw_event,
    }));

    const actionWindow = {
      started_at: new Date(action.started_at),
      ended_at: new Date(action.ended_at),
    };

    // 4b. D14: a write carries only an fd — resolve it to the path it was opened
    // on (from fd_install in the same window) so file_write actions attribute it.
    const resolvedWritePaths = resolveFdPaths(candidates);
    const enriched = candidates.map((event) => {
      const path = resolvedWritePaths.get(event.id);
      return path ? { ...event, raw_event: injectResolvedPath(event.raw_event, path) } : event;
    });

    // 5. Score each candidate
    const scored = enriched
      .map((event) => registry.scoreEvent(event, actionWindow, hints))
      .filter((s) => s !== null);

    // 6. Clear previous correlations and insert new ones
    await pool.query("DELETE FROM event_correlations WHERE action_id = $1", [actionId]);

    let highConf = 0;
    let medConf = 0;
    let lowConf = 0;

    for (const corr of scored) {
      await pool.query(
        `INSERT INTO event_correlations (action_id, event_id, confidence, correlation_method, signal_scores)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (action_id, event_id) DO UPDATE
           SET confidence = GREATEST(event_correlations.confidence, EXCLUDED.confidence),
               correlation_method = CASE
                 WHEN EXCLUDED.confidence > event_correlations.confidence
                 THEN EXCLUDED.correlation_method
                 ELSE event_correlations.correlation_method
               END,
               signal_scores = CASE
                 WHEN EXCLUDED.confidence > event_correlations.confidence
                 THEN EXCLUDED.signal_scores
                 ELSE event_correlations.signal_scores
               END`,
        [actionId, corr.event_id, corr.confidence, corr.method, JSON.stringify(corr.signal_scores)]
      );

      if (corr.confidence > config.bands.high) highConf++;
      else if (corr.confidence >= config.bands.medium) medConf++;
      else lowConf++;
    }

    // Find top contributing signals
    const signalCounts: Record<string, number> = {};
    for (const corr of scored) {
      signalCounts[corr.method] = (signalCounts[corr.method] ?? 0) + 1;
    }
    const topSignals = Object.entries(signalCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    return {
      action_id: actionId,
      events_correlated: scored.length,
      high_confidence: highConf,
      medium_confidence: medConf,
      low_confidence: lowConf,
      method: action.pod_name ? "multi_signal_pod" : "multi_signal_pid",
      top_signals: topSignals,
    };
  };

  return { correlateAction };
};
