import { describe, it, expect, vi } from "vitest";
import { createArgusClient } from "../argus.js";

const silentLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe("createArgusClient", () => {
  it("declare runs the work and returns its result even with no session (API unreachable)", async () => {
    // No start() call → sessionId stays null → declare must pass through without
    // touching the network, so instrumentation never blocks the agent.
    const client = createArgusClient({ apiUrl: "http://127.0.0.1:1", agentName: "t", log: silentLog });
    let ran = false;
    const out = await client.declare({ type: "llm_call", name: "x", input: "hi" }, async () => {
      ran = true;
      return "result";
    });
    expect(ran).toBe(true);
    expect(out).toBe("result");
  });

  it("end is a no-op when no session was started", async () => {
    const client = createArgusClient({ apiUrl: "http://127.0.0.1:1", agentName: "t", log: silentLog });
    await expect(client.end()).resolves.toBeUndefined();
  });
});
