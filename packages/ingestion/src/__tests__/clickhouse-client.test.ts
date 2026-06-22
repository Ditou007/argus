import { describe, it, expect } from "vitest";
import { createClickHouseClient, type NativeClientFactory } from "../clickhouse-client.js";

// Records calls to the native @clickhouse/client so we can assert the adapter
// delegates correctly and applies JSONEachRow — no real ClickHouse needed.
const makeNativeSpy = () => {
  const calls: Record<string, unknown[]> = { command: [], insert: [], query: [], close: [] };
  const factory: NativeClientFactory = () => ({
    command: async (p: unknown) => {
      calls.command.push(p);
      return {};
    },
    insert: async (p: unknown) => {
      calls.insert.push(p);
      return {};
    },
    query: async (p: unknown) => {
      calls.query.push(p);
      return { json: async () => [{ ok: 1 }] };
    },
    close: async () => {
      calls.close.push(true);
    },
  });
  return { factory, calls };
};

const CONFIG = { url: "http://ch:8123", database: "argus", username: "argus", password: "p" };

describe("createClickHouseClient — adapter over @clickhouse/client", () => {
  it("delegates command with the raw query", async () => {
    const { factory, calls } = makeNativeSpy();
    await createClickHouseClient(CONFIG, factory).command({ query: "CREATE TABLE x" });
    expect(calls.command).toEqual([{ query: "CREATE TABLE x" }]);
  });

  it("inserts with the JSONEachRow format", async () => {
    const { factory, calls } = makeNativeSpy();
    await createClickHouseClient(CONFIG, factory).insert({ table: "events", values: [{ a: 1 }] });
    expect(calls.insert[0]).toMatchObject({ table: "events", format: "JSONEachRow" });
  });

  it("query returns the parsed JSON rows", async () => {
    const { factory } = makeNativeSpy();
    const rows = await createClickHouseClient(CONFIG, factory).query({ query: "SELECT 1" });
    expect(rows).toEqual([{ ok: 1 }]);
  });

  it("close delegates to the native client", async () => {
    const { factory, calls } = makeNativeSpy();
    await createClickHouseClient(CONFIG, factory).close();
    expect(calls.close).toEqual([true]);
  });
});
