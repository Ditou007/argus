import { describe, it, expect } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import type pg from "pg";
import { createUnexplainedRouter } from "../unexplained.js";

/** A pg.Pool stub returning canned rows for each successive query() call. */
const fakePool = (responses: { rows: unknown[] }[]): pg.Pool => {
  let call = 0;
  return { query: async () => responses[call++] } as unknown as pg.Pool;
};

const appWith = (pool: pg.Pool): Express => {
  const app = express();
  app.use("/api/sessions", createUnexplainedRouter(pool));
  return app;
};

const SESSION = { id: "s1", pod_name: "pod-a", agent_pid: 1, started_at: "t0", ended_at: "t1" };
const sshRead = { process_kprobe: { args: [{ file_arg: { path: "/root/.ssh/id_rsa" } }] } };
const tmpWrite = { process_kprobe: { args: [{ file_arg: { path: "/tmp/x" } }] } };
const NO_ACTIONS = { rows: [] };

describe("GET /api/sessions/:id/unexplained (HTTP contract)", () => {
  it("200s with a coverage + risk-ranked triage envelope", async () => {
    // Query order is now: session → correlations → actions → events (streamed).
    const pool = fakePool([
      { rows: [SESSION] },
      { rows: [{ event_id: 1, confidence: 0.9 }, { event_id: 2, confidence: 0.85 }] }, // 98, 99 uncorrelated
      NO_ACTIONS,
      {
        rows: [
          { id: 1, event_type: "process_kprobe", function_name: "fd_install", process_binary: "python", raw_event: {} },
          { id: 2, event_type: "process_kprobe", function_name: "fd_install", process_binary: "python", raw_event: {} },
          { id: 98, event_type: "process_kprobe", function_name: "fd_install", process_binary: "curl", raw_event: tmpWrite },
          { id: 99, event_type: "process_kprobe", function_name: "fd_install", process_binary: "cat", raw_event: sshRead },
        ],
      },
    ]);
    const res = await request(appWith(pool)).get("/api/sessions/s1/unexplained");
    expect(res.status).toBe(200);
    expect(res.body.threshold).toBe(0.7);
    expect(res.body.total).toBe(4);
    expect(res.body.explained).toBe(2);
    expect(res.body.unexplained).toBe(2);
    expect(res.body.coverage_ratio).toBe(0.5);
    // the unexplained ssh read (HIGH) ranks above the /tmp write (LOW)
    expect(res.body.events.map((e: { id: number }) => e.id)).toEqual([99, 98]);
    expect(res.body.events[0].sensitivity).toBe("high");
    expect(res.body.risk_score).toBe(1); // the ssh read is fully unexplained → 1.0
  });

  it("404s for an unknown session", async () => {
    const res = await request(appWith(fakePool([{ rows: [] }]))).get("/api/sessions/nope/unexplained");
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Session not found");
  });

  it("400s on an out-of-range threshold", async () => {
    const res = await request(appWith(fakePool([]))).get("/api/sessions/s1/unexplained?threshold=2");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("threshold");
  });

  it("a zero-event session reports full coverage and an empty feed", async () => {
    // session → correlations(none) → actions(none) → events(none)
    const pool = fakePool([{ rows: [SESSION] }, { rows: [] }, NO_ACTIONS, { rows: [] }]);
    const res = await request(appWith(pool)).get("/api/sessions/s1/unexplained");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.coverage_ratio).toBe(1);
    expect(res.body.events).toEqual([]);
    expect(res.body.risk_score).toBe(0);
  });
});
