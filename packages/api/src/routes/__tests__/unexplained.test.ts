import { describe, it, expect } from "vitest";
import type pg from "pg";
import { loadTriageContext, streamSessionEvents, parseThreshold } from "../unexplained.js";
import type { TriageInputEvent } from "../../correlation/triage.js";

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

describe("loadTriageContext", () => {
  it("builds each event's best correlation confidence (firehose not loaded here)", async () => {
    const { pool, queries } = fakePool([
      { rows: [SESSION] },
      { rows: [{ event_id: 1, confidence: 0.9 }, { event_id: 1, confidence: 0.4 }, { event_id: 2, confidence: 0.85 }] },
      { rows: [{ action_type: "network_request", action_name: "x", input_summary: "GET https://api.x.com" }] },
    ]);
    const ctx = await loadTriageContext(pool, "s1");
    expect(ctx?.bestConfidence.get(1)).toBe(0.9); // strongest of 0.9/0.4
    expect(ctx?.bestConfidence.get(2)).toBe(0.85);
    expect(ctx?.session.id).toBe("s1");
    // Context reads only the session/correlations/actions tables — never `events`.
    expect(queries.some((q) => /FROM events/i.test(q))).toBe(false);
  });

  it("returns null when the session does not exist", async () => {
    const { pool } = fakePool([{ rows: [] }]);
    expect(await loadTriageContext(pool, "missing")).toBeNull();
  });
});

describe("streamSessionEvents", () => {
  const session = { id: "s1", pod_name: "pod-a", agent_pid: 1, started_at: "t0", ended_at: "t1" };

  it("pages with a keyset cursor, emits every event once, and stops on a short page", async () => {
    const ev = (id: number): TriageInputEvent =>
      ({ id, event_type: "process_kprobe", function_name: "x", process_binary: "a", process_pid: 1, raw_event: {} });
    // batchSize 2 → first page full (2) triggers a second page (1) which is short → stop.
    const { pool, queries } = fakePool([
      { rows: [{ ...ev(1), created_at: "t0", event_time: null }, { ...ev(2), created_at: "t0", event_time: null }] },
      { rows: [{ ...ev(3), created_at: "t1", event_time: null }] },
    ]);
    const seen: number[] = [];
    await streamSessionEvents(pool, session, (e) => seen.push(e.id), 2);
    expect(seen).toEqual([1, 2, 3]);
    expect(queries).toHaveLength(2);
    // window padded ±1s to match the engine's candidate window
    expect(queries[0]).toContain("- interval '1 second'");
    expect(queries[0]).toContain("+ interval '1 second'");
    // the second page advances via a keyset cursor (no OFFSET scan)
    expect(queries[1]).toContain("> ($");
  });

  it("issues a single page when the first is short", async () => {
    const { pool, queries } = fakePool([{ rows: [] }]);
    await streamSessionEvents(pool, session, () => {}, 5000);
    expect(queries).toHaveLength(1);
  });
});
