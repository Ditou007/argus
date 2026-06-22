import { createClient } from "@clickhouse/client";
import { CORRELATED_TRACES_TABLE } from "./correlated-traces.js";
import type { ClickHouseWriterConfig } from "./clickhouse-writer.js";

/** The native @clickhouse/client read surface — injectable for tests. */
export interface NativeReader {
  query: (params: {
    query: string;
    query_params?: Record<string, unknown>;
    format: "JSONEachRow";
  }) => Promise<{ json: () => Promise<unknown> }>;
  close: () => Promise<void>;
}

export type NativeReaderFactory = (config: ClickHouseWriterConfig) => NativeReader;

export interface TraceReader {
  getSessionTrace: (sessionId: string) => Promise<unknown[]>;
  close: () => Promise<void>;
}

// Columns of the explained trace, ordered for replay (declared action, then the
// attributed events in time order). The session id is parameterized — never
// interpolated — so a session id from the request can't inject SQL.
const SESSION_TRACE_QUERY = `SELECT session_id, action_id, action_type, process_pid, process_binary,
       function_name, event_time, confidence, method, signal_scores, reasons
FROM ${CORRELATED_TRACES_TABLE}
WHERE session_id = {sid:String}
ORDER BY action_id, event_time`;

const defaultFactory: NativeReaderFactory = (config) =>
  createClient({
    url: config.url,
    database: config.database,
    username: config.username,
    password: config.password,
  });

/**
 * Build the correlated-trace reader: fetch a session's full explained trace
 * (declared actions + attributed events + verdict) from ClickHouse for
 * audit/replay.
 * @function createTraceReader
 * @param config - ClickHouse connection settings
 * @param factory - native-client factory; defaults to the real @clickhouse/client (injectable for tests)
 * @returns a reader with getSessionTrace + close
 */
export const createTraceReader = (
  config: ClickHouseWriterConfig,
  factory: NativeReaderFactory = defaultFactory
): TraceReader => {
  const client = factory(config);
  return {
    getSessionTrace: async (sessionId) => {
      const result = await client.query({
        query: SESSION_TRACE_QUERY,
        query_params: { sid: sessionId },
        format: "JSONEachRow",
      });
      const rows = await result.json();
      return Array.isArray(rows) ? rows : [];
    },
    close: () => client.close(),
  };
};
