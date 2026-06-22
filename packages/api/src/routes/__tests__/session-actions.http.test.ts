import { describe, it, expect } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import type pg from "pg";
import { createActionRouter } from "../session-actions.js";

const fakePool = (responses: { rows: unknown[] }[]): pg.Pool => {
  let call = 0;
  return { query: async () => responses[call++] ?? { rows: [] } } as unknown as pg.Pool;
};

// Minimal liveStream + streaming spies — we only assert the lifecycle hooks fire.
const spies = () => {
  const opened: string[] = [];
  const closed: string[] = [];
  const liveStream = {
    notifyActionStarted: () => {},
    notifyActionEnded: () => {},
    notifyCorrelation: () => {},
  } as unknown as Parameters<typeof createActionRouter>[1];
  const streaming = {
    openAction: (actionId: string) => opened.push(actionId),
    ingest: () => {},
    closeAction: async (input: { action_id: string }) => {
      closed.push(input.action_id);
      return null;
    },
    openActionIds: () => [],
  } as unknown as Parameters<typeof createActionRouter>[2];
  return { liveStream, streaming, opened, closed };
};

const appWith = (pool: pg.Pool, liveStream: Parameters<typeof createActionRouter>[1], streaming?: Parameters<typeof createActionRouter>[2]): Express => {
  const app = express();
  app.use(express.json());
  app.use("/api/sessions", createActionRouter(pool, liveStream, streaming));
  return app;
};

describe("POST /api/sessions/:id/actions", () => {
  it("400s when action_type is missing", async () => {
    const { liveStream, streaming } = spies();
    const res = await request(appWith(fakePool([]), liveStream, streaming)).post("/api/sessions/s1/actions").send({});
    expect(res.status).toBe(400);
  });

  it("creates the action and opens a streaming window", async () => {
    const { liveStream, streaming, opened } = spies();
    const pool = fakePool([
      { rows: [{ id: "act-1", session_id: "s1", started_at: "2026-06-22T00:00:00Z" }] }, // INSERT
      { rows: [{ pod_name: null, agent_pid: 4242 }] }, // session lookup
    ]);
    const res = await request(appWith(pool, liveStream, streaming))
      .post("/api/sessions/s1/actions")
      .send({ action_type: "network_request" });
    expect(res.status).toBe(201);
    expect(res.body.action.id).toBe("act-1");
    expect(opened).toEqual(["act-1"]);
  });
});

describe("PATCH /api/sessions/actions/:id/end", () => {
  it("404s when the action is unknown or already ended", async () => {
    const { liveStream, streaming } = spies();
    const res = await request(appWith(fakePool([{ rows: [] }]), liveStream, streaming)).patch("/api/sessions/actions/x/end").send({});
    expect(res.status).toBe(404);
  });
});
