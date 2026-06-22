import { createStreamingCorrelator, type StreamEvent, type CorrelatedTrace } from "./streaming-correlator.js";
import { parseActionHints } from "./action-parser.js";
import { createDnsCache } from "./dns-cache.js";
import { DEFAULT_CORRELATION_CONFIG, type CorrelationConfig } from "./config.js";
import type { CorrelationResult } from "./types.js";

/** Where finalized traces are persisted (the ClickHouse trace-store, or a fake). */
export interface TraceSink {
  persist: (trace: CorrelatedTrace) => Promise<void>;
}

/** Resolves expected hostnames to IPs before scoring (the DNS cache, or a fake). */
export interface DnsResolver {
  resolveAll: (hostnames: string[]) => Promise<string[]>;
}

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
 * the stream consumer calls ingest. closeAction parses hints (+ DNS), finalizes
 * the trace, and persists it.
 * @function createStreamingService
 * @param deps - traceStore (persist sink), optional dns resolver, config
 * @returns openAction, ingest, closeAction, openActionIds
 */
export const createStreamingService = (deps: {
  traceStore: TraceSink;
  dns?: DnsResolver;
  config?: CorrelationConfig;
}) => {
  const config = deps.config ?? DEFAULT_CORRELATION_CONFIG;
  const dns = deps.dns ?? createDnsCache();
  const engine = createStreamingCorrelator({ config });

  const openAction = (actionId: string, scope: ActionScopeInput, startedAt: Date): void => {
    engine.openAction(actionId, scope, startedAt);
  };

  const ingest = (event: StreamEvent): void => {
    engine.ingestEvent(event);
  };

  const closeAction = async (input: CloseActionInput): Promise<CorrelationResult | null> => {
    const baseHints = parseActionHints({
      action_type: input.action_type,
      action_name: input.action_name,
      input_summary: input.input_summary,
      agent_pid: input.agent_pid,
      pod_name: input.pod_name,
    });
    const hints =
      baseHints.expected_hostnames.length > 0
        ? { ...baseHints, expected_ips: await dns.resolveAll(baseHints.expected_hostnames) }
        : baseHints;

    const trace = engine.closeAction({
      action_id: input.action_id,
      session_id: input.session_id,
      action_type: input.action_type,
      ended_at: input.ended_at,
      hints,
    });
    if (!trace) return null;
    await deps.traceStore.persist(trace);
    return trace.summary;
  };

  return { openAction, ingest, closeAction, openActionIds: engine.openActionIds };
};
