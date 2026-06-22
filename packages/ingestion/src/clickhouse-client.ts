import { createClient } from "@clickhouse/client";
import type { ClickHouseClient } from "./clickhouse-store.js";

export interface ClickHouseConfig {
  readonly url: string;
  readonly database: string;
  readonly username: string;
  readonly password: string;
}

// ClickHouse speaks JSONEachRow for both row inserts and row-stream reads.
const ROW_FORMAT: "JSONEachRow" = "JSONEachRow";

// The subset of the native @clickhouse/client surface we drive. Injectable via
// the factory so the adapter's delegation + JSON parsing is unit-testable
// without a running ClickHouse.
export interface NativeClient {
  command: (params: { query: string }) => Promise<unknown>;
  insert: (params: { table: string; values: unknown[]; format: "JSONEachRow" }) => Promise<unknown>;
  query: (params: { query: string; format: "JSONEachRow" }) => Promise<{ json: () => Promise<unknown> }>;
  close: () => Promise<void>;
}

export type NativeClientFactory = (config: ClickHouseConfig) => NativeClient;

const defaultFactory: NativeClientFactory = (config) => {
  const client = createClient({
    url: config.url,
    database: config.database,
    username: config.username,
    password: config.password,
  });
  return {
    command: (params) => client.command(params),
    insert: (params) => client.insert(params),
    query: (params) => client.query(params),
    close: () => client.close(),
  };
};

/**
 * Adapt the native @clickhouse/client to the store's ClickHouseClient contract,
 * applying JSONEachRow and parsing query results to rows.
 * @function createClickHouseClient
 * @param config - ClickHouse connection settings (url, database, credentials)
 * @param factory - native-client factory; defaults to the real @clickhouse/client (injectable for tests)
 * @returns a ClickHouseClient the store can drive
 */
export const createClickHouseClient = (
  config: ClickHouseConfig,
  factory: NativeClientFactory = defaultFactory
): ClickHouseClient => {
  const client = factory(config);
  return {
    command: async ({ query }) => {
      await client.command({ query });
    },
    insert: async ({ table, values }) => {
      await client.insert({ table, values: [...values], format: ROW_FORMAT });
    },
    query: async ({ query }) => {
      const result = await client.query({ query, format: ROW_FORMAT });
      const rows = await result.json();
      return Array.isArray(rows) ? rows : [];
    },
    close: () => client.close(),
  };
};
