import { createClient } from "@clickhouse/client";

export interface ClickHouseWriterConfig {
  readonly url: string;
  readonly database: string;
  readonly username: string;
  readonly password: string;
}

/** A write-only ClickHouse client: DDL + row inserts for the correlated-trace store. */
export interface ClickHouseWriter {
  command: (query: string) => Promise<void>;
  insert: (table: string, rows: readonly unknown[]) => Promise<void>;
  close: () => Promise<void>;
}

/** The native @clickhouse/client surface the writer drives — injectable for tests. */
export interface NativeWriter {
  command: (params: { query: string }) => Promise<unknown>;
  insert: (params: { table: string; values: unknown[]; format: "JSONEachRow" }) => Promise<unknown>;
  close: () => Promise<void>;
}

export type NativeWriterFactory = (config: ClickHouseWriterConfig) => NativeWriter;

const defaultFactory: NativeWriterFactory = (config) =>
  createClient({
    url: config.url,
    database: config.database,
    username: config.username,
    password: config.password,
  });

/**
 * Build the write-only ClickHouse adapter for the correlated-trace store.
 * @function createClickHouseWriter
 * @param config - ClickHouse connection settings
 * @param factory - native-client factory; defaults to the real @clickhouse/client (injectable for tests)
 * @returns a ClickHouseWriter (command + insert + close)
 */
export const createClickHouseWriter = (
  config: ClickHouseWriterConfig,
  factory: NativeWriterFactory = defaultFactory
): ClickHouseWriter => {
  const client = factory(config);
  return {
    command: async (query) => {
      await client.command({ query });
    },
    insert: async (table, rows) => {
      await client.insert({ table, values: [...rows], format: "JSONEachRow" });
    },
    close: () => client.close(),
  };
};
