import { describe, it, expect } from "vitest";
import { createTraceReader, type NativeReaderFactory } from "../trace-reader.js";

const makeSpy = (rows: unknown[]) => {
  const queries: { query: string; params: Record<string, unknown> }[] = [];
  const factory: NativeReaderFactory = () => ({
    query: async (p: { query: string; query_params?: Record<string, unknown> }) => {
      queries.push({ query: p.query, params: p.query_params ?? {} });
      return { json: async () => rows };
    },
    close: async () => {},
  });
  return { factory, queries };
};

const CONFIG = { url: "http://ch:8123", database: "argus", username: "argus", password: "p" };

describe("createTraceReader.getSessionTrace", () => {
  it("queries correlated_traces for the session (parameterized — no interpolation)", async () => {
    const { factory, queries } = makeSpy([]);
    await createTraceReader(CONFIG, factory).getSessionTrace("sess-1");
    expect(queries[0].query).toContain("FROM correlated_traces");
    expect(queries[0].query).toContain("WHERE session_id = {sid:String}");
    expect(queries[0].params).toEqual({ sid: "sess-1" });
  });

  it("returns the parsed trace rows", async () => {
    const rows = [{ action_id: "a1", function_name: "tcp_connect", confidence: 0.9 }];
    const { factory } = makeSpy(rows);
    const got = await createTraceReader(CONFIG, factory).getSessionTrace("sess-1");
    expect(got).toEqual(rows);
  });

  it("returns [] when the query yields no rows", async () => {
    const { factory } = makeSpy([]);
    expect(await createTraceReader(CONFIG, factory).getSessionTrace("sess-x")).toEqual([]);
  });
});
