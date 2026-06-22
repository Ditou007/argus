import type { ActionHints, ActionWindow, CorrelationResult, EventCandidate, ScoredCorrelation } from "./types.js";
import { resolveFdPaths, injectResolvedPath } from "./fd-path.js";
import { createSignalRegistry } from "./signal-registry.js";
import { DEFAULT_CORRELATION_CONFIG, type CorrelationConfig } from "./config.js";

// Same ±1s padding the batch correlator uses (buildCandidateQuery) to tolerate
// ingestion/clock skew when bounding the action window.
const WINDOW_TOLERANCE_MS = 1000;
const TOP_SIGNALS = 3;

/** A captured event as it arrives on the stream — an EventCandidate plus the pod it ran in (for pod-scoped attribution). */
export interface StreamEvent extends EventCandidate {
  readonly pod_name: string | null;
}

/** The scoring entry point — defaults to the real signal registry; injectable for tests. */
export type EventScorer = (
  event: EventCandidate,
  window: ActionWindow,
  hints: ActionHints
) => ScoredCorrelation | null;

/** A declared action's identity for scoping streamed events (pod when present, else host PID). */
export interface ActionScope {
  readonly pod_name: string | null;
  readonly agent_pid: number;
}

/** Everything needed to finalize an action: its identity, the close time, and the resolved hints to score against. */
export interface CloseRequest {
  readonly action_id: string;
  readonly session_id: string;
  readonly action_type: string;
  readonly ended_at: Date;
  readonly hints: ActionHints;
}

export interface AttributedEvent {
  readonly event: StreamEvent;
  readonly scored: ScoredCorrelation;
}

/** The explained trace for one action: the attributed events plus the band summary. */
export interface CorrelatedTrace {
  readonly session_id: string;
  readonly action_id: string;
  readonly action_type: string;
  readonly method: string;
  readonly attributed: readonly AttributedEvent[];
  readonly summary: CorrelationResult;
}

interface OpenWindow {
  readonly scope: ActionScope;
  readonly started_at: Date;
  readonly events: Map<number, StreamEvent>;
}

const effectiveTime = (event: StreamEvent): number => (event.event_time ?? event.created_at).getTime();

const matchesScope = (event: StreamEvent, scope: ActionScope): boolean =>
  scope.pod_name !== null ? event.pod_name === scope.pod_name : event.process_pid === scope.agent_pid;

const summarize = (
  actionId: string,
  attributed: readonly AttributedEvent[],
  method: string,
  config: CorrelationConfig
): CorrelationResult => {
  const counts: Record<string, number> = {};
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const { scored } of attributed) {
    if (scored.confidence > config.bands.high) high += 1;
    else if (scored.confidence >= config.bands.medium) medium += 1;
    else low += 1;
    counts[scored.method] = (counts[scored.method] ?? 0) + 1;
  }
  const topSignals = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_SIGNALS)
    .map(([name]) => name);
  return {
    action_id: actionId,
    events_correlated: attributed.length,
    high_confidence: high,
    medium_confidence: medium,
    low_confidence: low,
    method,
    top_signals: topSignals,
  };
};

/**
 * Build the streaming correlator. Unlike the batch correlator (which queries the
 * store once at action-end and so races ingestion lag for fast ops), this
 * **accumulates** streamed events into open declared-action windows as they
 * arrive, then runs the **same** signal scoring at action-close over the
 * accumulated set — fixing the race without changing the score.
 * @function createStreamingCorrelator
 * @param deps - optional injected scorer (defaults to the real signal registry) and config
 * @returns the engine: openAction, ingestEvent, closeAction, openActionIds
 */
export const createStreamingCorrelator = (
  deps: { scoreEvent?: EventScorer; config?: CorrelationConfig } = {}
) => {
  const config = deps.config ?? DEFAULT_CORRELATION_CONFIG;
  const score = deps.scoreEvent ?? createSignalRegistry(config).scoreEvent;
  const windows = new Map<string, OpenWindow>();

  const openAction = (actionId: string, scope: ActionScope, startedAt: Date): void => {
    windows.set(actionId, { scope, started_at: startedAt, events: new Map() });
  };

  const ingestEvent = (event: StreamEvent): void => {
    const eventTime = effectiveTime(event);
    for (const window of windows.values()) {
      const afterStart = eventTime >= window.started_at.getTime() - WINDOW_TOLERANCE_MS;
      if (afterStart && matchesScope(event, window.scope)) {
        window.events.set(event.id, event);
      }
    }
  };

  const closeAction = (req: CloseRequest): CorrelatedTrace | null => {
    const open = windows.get(req.action_id);
    if (!open) return null;
    windows.delete(req.action_id);

    const lo = open.started_at.getTime() - WINDOW_TOLERANCE_MS;
    const hi = req.ended_at.getTime() + WINDOW_TOLERANCE_MS;
    // Sort by effective time before fd-path resolution: resolveFdPaths is
    // order-dependent (an fd_install must be walked before the sys_write that
    // uses it), and stream arrival order is not guaranteed to be time order.
    // This mirrors the batch correlator's `ORDER BY COALESCE(event_time, created_at)`.
    // No per-window LIMIT (the batch path's LIMIT 500 can truncate a busy window
    // and undercount); windows are bounded instead by closing on action-end.
    const candidates = [...open.events.values()]
      .filter((event) => {
        const time = effectiveTime(event);
        return time >= lo && time <= hi;
      })
      .sort((a, b) => effectiveTime(a) - effectiveTime(b));

    const resolvedPaths = resolveFdPaths(candidates);
    const window: ActionWindow = { started_at: open.started_at, ended_at: req.ended_at };

    const attributed: AttributedEvent[] = [];
    for (const event of candidates) {
      const path = resolvedPaths.get(event.id);
      const enriched = path ? { ...event, raw_event: injectResolvedPath(event.raw_event, path) } : event;
      const scored = score(enriched, window, req.hints);
      if (scored) attributed.push({ event, scored });
    }

    const method = open.scope.pod_name !== null ? "multi_signal_pod" : "multi_signal_pid";
    return {
      session_id: req.session_id,
      action_id: req.action_id,
      action_type: req.action_type,
      method,
      attributed,
      summary: summarize(req.action_id, attributed, method, config),
    };
  };

  const openActionIds = (): string[] => [...windows.keys()];

  return { openAction, ingestEvent, closeAction, openActionIds };
};
