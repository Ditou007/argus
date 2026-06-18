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

describe("GET /api/sessions/:id/unexplained (HTTP contract)", () => {
  it("200s with the unexplained events and threshold envelope", async () => {
    const pool = fakePool([
      { rows: [SESSION] },
      { rows: [{ id: 1 }, { id: 2 }, { id: 99 }] }, // session events
      { rows: [{ event_id: 1, confidence: 0.9 }, { event_id: 2, confidence: 0.85 }] }, // 99 uncorrelated
    ]);
    const res = await request(appWith(pool)).get("/api/sessions/s1/unexplained");
    expect(res.status).toBe(200);
    expect(res.body.threshold).toBe(0.7);
    expect(res.body.unexplained_count).toBe(1);
    expect(res.body.events.map((e: { id: number }) => e.id)).toEqual([99]);
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

  it("honours a valid threshold query param", async () => {
    const pool = fakePool([
      { rows: [SESSION] },
      { rows: [{ id: 1 }, { id: 2 }] },
      { rows: [{ event_id: 1, confidence: 0.5 }, { event_id: 2, confidence: 0.95 }] },
    ]);
    // at threshold 0.9, event 1 (0.5) is unexplained, event 2 (0.95) is not
    const res = await request(appWith(pool)).get("/api/sessions/s1/unexplained?threshold=0.9");
    expect(res.status).toBe(200);
    expect(res.body.threshold).toBe(0.9);
    expect(res.body.events.map((e: { id: number }) => e.id)).toEqual([1]);
  });
});
