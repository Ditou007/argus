import { describe, it, expect } from "vitest";
import { createClickHouseWriter, type NativeWriterFactory } from "../clickhouse-writer.js";

const makeSpy = () => {
  const calls: Record<string, unknown[]> = { command: [], insert: [], close: [] };
  const factory: NativeWriterFactory = () => ({
    command: async (p: unknown) => {
      calls.command.push(p);
      return {};
    },
    insert: async (p: unknown) => {
      calls.insert.push(p);
      return {};
    },
    close: async () => {
      calls.close.push(true);
    },
  });
  return { factory, calls };
};

const CONFIG = { url: "http://ch:8123", database: "argus", username: "argus", password: "p" };

describe("createClickHouseWriter", () => {
  it("runs a command with the raw query", async () => {
    const { factory, calls } = makeSpy();
    await createClickHouseWriter(CONFIG, factory).command("CREATE TABLE t");
    expect(calls.command).toEqual([{ query: "CREATE TABLE t" }]);
  });

  it("inserts rows into a table as JSONEachRow", async () => {
    const { factory, calls } = makeSpy();
    await createClickHouseWriter(CONFIG, factory).insert("correlated_traces", [{ a: 1 }]);
    expect(calls.insert[0]).toMatchObject({ table: "correlated_traces", format: "JSONEachRow" });
  });

  it("closes the underlying client", async () => {
    const { factory, calls } = makeSpy();
    await createClickHouseWriter(CONFIG, factory).close();
    expect(calls.close).toEqual([true]);
  });
});
