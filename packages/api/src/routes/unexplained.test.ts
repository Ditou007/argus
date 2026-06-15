import { describe, it, expect } from "vitest";
import type pg from "pg";
import { findUnexplainedEvents, parseThreshold } from "./unexplained.js";

/** A pg.Pool stub that records queries and returns canned rows in call order. */
const fakePool = (responses: { rows: unknown[] }[]): { pool: pg.Pool; queries: string[] } => {
  const queries: string[] = [];
  let call = 0;
  const pool = {
    query: async (text: string) => {
      queries.push(text);
      return responses[call++];
    },
  } as unknown as pg.Pool;
  return { pool, queries };
};

const SESSION = { id: "s1", pod_name: "pod-a", agent_pid: 1, started_at: "t0", ended_at: "t1" };

describe("parseThreshold", () => {
  it("defaults to the high band when absent", () => {
    expect(parseThreshold(undefined)).toBe(0.7);
  });

  it("accepts a valid number in [0,1]", () => {
    expect(parseThreshold("0.5")).toBe(0.5);
  });

  it("rejects NaN and out-of-range values", () => {
    expect(parseThreshold("abc")).toBeNull();
    expect(parseThreshold("1.5")).toBeNull();
    expect(parseThreshold("-0.1")).toBeNull();
  });
});

describe("findUnexplainedEvents", () => {
  it("returns events not correlated at or above the threshold to any action", async () => {
    const { pool, queries } = fakePool([
      { rows: [SESSION] },
      { rows: [{ id: 1 }, { id: 2 }, { id: 99 }] }, // session events
      { rows: [{ event_id: 1, confidence: 0.9 }, { event_id: 2, confidence: 0.85 }] }, // 99 uncorrelated
    ]);
    const events = await findUnexplainedEvents(pool, "s1", 0.7);
    expect(events?.map((e) => (e as { id: number }).id)).toEqual([99]);
    // the event window must stay padded ±1s to match the engine's candidate window
    expect(queries[1]).toContain("- interval '1 second'");
    expect(queries[1]).toContain("+ interval '1 second'");
  });

  it("returns null when the session does not exist", async () => {
    const { pool } = fakePool([{ rows: [] }]);
    expect(await findUnexplainedEvents(pool, "missing", 0.7)).toBeNull();
  });
});
