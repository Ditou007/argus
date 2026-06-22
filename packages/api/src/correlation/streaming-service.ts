import { createStreamingCorrelator, type StreamEvent, type CorrelatedTrace } from "./streaming-correlator.js";
import { parseActionHints } from "./action-parser.js";
import { createDnsCache } from "./dns-cache.js";
import { DEFAULT_CORRELATION_CONFIG, type CorrelationConfig } from "./config.js";
import type { ActionHints } from "./types.js";

/** Where finalized traces are persisted (the ClickHouse trace-store, or a fake). */
export interface TraceSink {
  persist: (trace: CorrelatedTrace) => Promise<void>;
}

/** Resolves expected hostnames to IPs before scoring (the DNS cache, or a fake). */
export interface DnsResolver {
  resolveAll: (hostnames: string[]) => Promise<string[]>;
}

/** Defers a finalizer by `ms` (real `setTimeout`, or a manual scheduler in tests). */
export interface DeferScheduler {
  defer: (fn: () => void | Promise<void>, ms: number) => void;
}

// Default grace period before an ended action is finalized. The ingestion
// pipeline lags event_time→stream by ~10s steady-state (more during backlog),
// while declared actions are sub-second; without a settle window the action
// window closes before its events arrive and the trace is empty (SPEC_04
// finding #1). Overridable per-deployment (the demo can shorten it).
const DEFAULT_TRACE_SETTLE_MS = 60_000;

const defaultScheduler: DeferScheduler = {
  defer: (fn, ms) => void setTimeout(() => void fn(), ms),
};

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export interface ActionScopeInput {
  readonly pod_name: string | null;
  readonly agent_pid: number;
}

export interface CloseActionInput {
  readonly action_id: string;
  readonly session_id: string;
  readonly action_type: string;
  readonly action_name: string | null;
  readonly input_summary: string | null;
  readonly agent_pid: number;
  readonly pod_name: string | null;
  readonly ended_at: Date;
}

/**
 * Build the streaming-correlation service: the engine wired to a trace sink and
 * DNS resolver. Routes call openAction/closeAction from the action lifecycle;
 * the stream consumer calls ingest.
 *
 * closeAction parses hints (+ DNS) at action-end, then **defers** finalization
 * by a settle delay (SPEC_04 Slice 2e): the window stays open during the grace
 * period so events that reach the stream after the (sub-second) action ends —
 * the live pipeline lags ~10–60s — are still accumulated. At settle the engine
 * scores the accumulated set against the real {started_at, ended_at} window
 * (scoring unchanged) and the trace is persisted.
 * @function createStreamingService
 * @param deps - traceStore (persist sink), optional dns resolver, scheduler, settleMs, config
 * @returns openAction, ingest, closeAction, openActionIds
 */
export const createStreamingService = (deps: {
  traceStore: TraceSink;
  dns?: DnsResolver;
  config?: CorrelationConfig;
  scheduler?: DeferScheduler;
  settleMs?: number;
}) => {
  const config = deps.config ?? DEFAULT_CORRELATION_CONFIG;
  const dns = deps.dns ?? createDnsCache();
  const scheduler = deps.scheduler ?? defaultScheduler;
  const settleMs = deps.settleMs ?? DEFAULT_TRACE_SETTLE_MS;
  const engine = createStreamingCorrelator({ config });

  const openAction = (actionId: string, scope: ActionScopeInput, startedAt: Date): void => {
    engine.openAction(actionId, scope, startedAt);
  };

  const ingest = (event: StreamEvent): void => {
    engine.ingestEvent(event);
  };

  // Score the (now-settled) window and persist; logged-and-swallowed so a
  // ClickHouse hiccup never breaks the timer or the agent's action lifecycle.
  const finalize = async (input: CloseActionInput, hints: ActionHints): Promise<void> => {
    try {
      const trace = engine.closeAction({
        action_id: input.action_id,
        session_id: input.session_id,
        action_type: input.action_type,
        ended_at: input.ended_at,
        hints,
      });
      if (trace) await deps.traceStore.persist(trace);
    } catch (err) {
      console.error("Streaming trace finalize failed:", describeError(err));
    }
  };

  const closeAction = async (input: CloseActionInput): Promise<void> => {
    const baseHints = parseActionHints({
      action_type: input.action_type,
      action_name: input.action_name,
      input_summary: input.input_summary,
      agent_pid: input.agent_pid,
      pod_name: input.pod_name,
    });
    // Resolve DNS now (at action-end) while the hint context is fresh; scoring
    // itself is deferred to the settle tick so late events are included.
    const hints =
      baseHints.expected_hostnames.length > 0
        ? { ...baseHints, expected_ips: await dns.resolveAll(baseHints.expected_hostnames) }
        : baseHints;

    scheduler.defer(() => finalize(input, hints), settleMs);
  };

  return { openAction, ingest, closeAction, openActionIds: engine.openActionIds };
};
