import type { TetragonEvent } from "./types.js";
import { toEventFields } from "./event-fields.js";

// Minimal contract the store depends on — implemented by the real
// @clickhouse/client adapter (clickhouse-client.ts) and faked in unit tests.
// Keeping I/O behind this interface is what makes the store unit-testable
// without a running ClickHouse.
export interface ClickHouseClient {
  command: (params: { query: string }) => Promise<void>;
  insert: (params: { table: string; values: readonly unknown[] }) => Promise<void>;
  query: (params: { query: string }) => Promise<readonly unknown[]>;
  close: () => Promise<void>;
}

/** ClickHouse table name for the raw syscall firehose. */
export const EVENTS_TABLE = "events";

/**
 * DDL for the raw syscall firehose. Columns mirror the Postgres `events` table
 * so the correlator can query the same shape. Non-Nullable columns (ClickHouse
 * idiom — nulls become ""/0) keep MergeTree lean. Partitioning + TTL are added
 * by SPEC_04 Slice 4 (retention); this slice creates the base table.
 */
export const EVENTS_DDL = `CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} (
  event_type     LowCardinality(String),
  process_binary String,
  process_pid    Int32,
  function_name  String,
  pod_name       String,
  pod_namespace  String,
  container_id   String,
  event_time     String,
  raw_event      String,
  inserted_at    DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (inserted_at, process_pid)`;

// One ClickHouse row: the shared field projection with nulls coerced to
// ClickHouse-safe defaults, plus the full raw event as JSON.
export interface EventRow {
  readonly event_type: string;
  readonly process_binary: string;
  readonly process_pid: number;
  readonly function_name: string;
  readonly pod_name: string;
  readonly pod_namespace: string;
  readonly container_id: string;
  readonly event_time: string;
  readonly raw_event: string;
}

/**
 * Map a Tetragon event to a ClickHouse row: the shared field projection with
 * nulls coerced to ClickHouse-safe defaults, plus the full raw event as JSON.
 * @function toEventRow
 * @param event - the raw Tetragon event
 * @returns the ClickHouse `events` row
 */
export const toEventRow = (event: TetragonEvent): EventRow => {
  const f = toEventFields(event);
  return {
    event_type: f.event_type,
    process_binary: f.process_binary ?? "",
    process_pid: f.process_pid ?? 0,
    function_name: f.function_name ?? "",
    pod_name: f.pod_name ?? "",
    pod_namespace: f.pod_namespace ?? "",
    container_id: f.container_id ?? "",
    event_time: f.event_time ?? "",
    raw_event: JSON.stringify(event),
  };
};

/**
 * Build the ClickHouse-backed raw-event store over an injected client.
 * @function createClickHouseStore
 * @param client - the injected ClickHouse client (real adapter or test fake)
 * @returns the store API: initialize (DDL), insert (one raw event), close
 */
export const createClickHouseStore = (client: ClickHouseClient) => {
  // Tracks whether the table DDL has run. If ClickHouse is unreachable at boot
  // (initialize fails, swallowed by the caller), the next insert re-runs the
  // idempotent CREATE TABLE IF NOT EXISTS so dual-write self-heals on recovery.
  let initialized = false;

  const initialize = async (): Promise<void> => {
    await client.command({ query: EVENTS_DDL });
    initialized = true;
  };

  const insert = async (event: TetragonEvent): Promise<void> => {
    if (!initialized) {
      await initialize();
    }
    await client.insert({ table: EVENTS_TABLE, values: [toEventRow(event)] });
  };

  const close = async (): Promise<void> => {
    await client.close();
  };

  return { initialize, insert, close };
};
