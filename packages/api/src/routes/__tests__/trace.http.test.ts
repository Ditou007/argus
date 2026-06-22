import { describe, it, expect } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { createTraceRouter } from "../trace.js";
import type { TraceReader } from "../../correlation/trace-reader.js";

const appWith = (reader: TraceReader): Express => {
  const app = express();
  app.use("/api/sessions", createTraceRouter(reader));
  return app;
};

const fakeReader = (impl: TraceReader["getSessionTrace"]): TraceReader => ({
  getSessionTrace: impl,
  close: async () => {},
});

describe("GET /api/sessions/:id/trace", () => {
  it("200s with the session's correlated trace envelope", async () => {
    const rows = [{ action_id: "a1", function_name: "tcp_connect", confidence: 0.9 }];
    const res = await request(appWith(fakeReader(async () => rows))).get("/api/sessions/s1/trace");
    expect(res.status).toBe(200);
    expect(res.body.session_id).toBe("s1");
    expect(res.body.count).toBe(1);
    expect(res.body.events).toEqual(rows);
  });

  it("200s with an empty trace for a session with no attributed events", async () => {
    const res = await request(appWith(fakeReader(async () => []))).get("/api/sessions/empty/trace");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it("500s when the reader fails (and does not leak the error detail)", async () => {
    const res = await request(
      appWith(
        fakeReader(async () => {
          throw new Error("clickhouse down");
        })
      )
    ).get("/api/sessions/s1/trace");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch trace");
  });
});
