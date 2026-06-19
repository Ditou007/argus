import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../server.js";
import type { ChatTurnDeps } from "../loop.js";

const silentLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const deps: ChatTurnDeps = {
  callLlm: async () => ({ text: "hi there", toolCalls: [] }),
  declare: async (_action, run) => run(),
  runTool: async () => "",
  log: silentLog,
  llmActionName: "test.model",
};

const app = createApp({ deps, log: silentLog });

describe("chat server", () => {
  it("GET /health reports healthy", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
  });

  it("POST /chat rejects a missing message with 400", async () => {
    const res = await request(app).post("/chat").send({});
    expect(res.status).toBe(400);
  });

  it("POST /chat returns the model reply for a valid message", async () => {
    const res = await request(app).post("/chat").send({ message: "hello" });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("hi there");
  });
});
