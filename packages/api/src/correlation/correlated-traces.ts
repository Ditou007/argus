import type { CorrelatedTrace } from "./streaming-correlator.js";

/** ClickHouse table holding the explained trace: one row per attributed event. */
export const CORRELATED_TRACES_TABLE = "correlated_traces";

/**
 * DDL for the correlated-trace store. Denormalized (event fields embedded
 * alongside the score) so a session's full trace is a single scan with no join.
 * Partitioning + the 180d TTL are added by SPEC_04 Slice 4 (retention).
 */
export const CORRELATED_TRACES_DDL = `CREATE TABLE IF NOT EXISTS ${CORRELATED_TRACES_TABLE} (
  session_id     String,
  action_id      String,
  action_type    LowCardinality(String),
  process_pid    Int32,
  process_binary String,
  function_name  String,
  event_time     String,
  confidence     Float64,
  method         LowCardinality(String),
  signal_scores  String,
  reasons        String,
  raw_event      String,
  attributed_at  DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (session_id, action_id, event_time)`;

/** One denormalized correlated-trace row. */
export interface TraceRow {
  readonly session_id: string;
  readonly action_id: string;
  readonly action_type: string;
  readonly process_pid: number;
  readonly process_binary: string;
  readonly function_name: string;
  readonly event_time: string;
  readonly confidence: number;
  readonly method: string;
  readonly signal_scores: string;
  readonly reasons: string;
  readonly raw_event: string;
}

/**
 * Flatten a correlated trace into ClickHouse rows (one per attributed event),
 * coercing nullable fields to ClickHouse-safe defaults. The per-signal `reasons`
 * (the audit narrative) travel with the trace; `event_time` falls back to the
 * ingest time so trace ordering never collapses to empty.
 * @function toTraceRows
 * @param trace - the explained trace produced by the streaming correlator
 * @returns the rows to insert into correlated_traces
 */
export const toTraceRows = (trace: CorrelatedTrace): TraceRow[] =>
  trace.attributed.map(({ event, scored }) => ({
    session_id: trace.session_id,
    action_id: trace.action_id,
    action_type: trace.action_type,
    process_pid: event.process_pid,
    process_binary: event.process_binary ?? "",
    function_name: event.function_name ?? "",
    event_time: (event.event_time ?? event.created_at).toISOString(),
    confidence: scored.confidence,
    method: scored.method,
    signal_scores: JSON.stringify(scored.signal_scores),
    reasons: JSON.stringify(scored.reasons),
    raw_event: JSON.stringify(event.raw_event),
  }));
