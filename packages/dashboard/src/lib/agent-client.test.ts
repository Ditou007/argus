import { describe, it, expect, vi } from "vitest";
import { sendChat, latestSessionId, fetchTriage } from "./agent-client.js";

describe("agent-client", () => {
  it("sendChat posts the message and returns the reply + runs", async () => {
    const body = { reply: "done", runs: [{ call: { tool: "read_file", args: { path: "/x" } }, sanctioned: false, reason: "r", output: "o" }] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body)));
    const res = await sendChat("hi", fetchMock as unknown as typeof fetch);
    expect(res.reply).toBe("done");
    expect(res.runs[0]?.sanctioned).toBe(false);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toContain("hi");
  });

  it("sendChat throws on a non-2xx response (never a silent success)", async () => {
    const fetchMock = vi.fn(async () => new Response("err", { status: 502 }));
    await expect(sendChat("hi", fetchMock as unknown as typeof fetch)).rejects.toThrow(/502/);
  });

  it("latestSessionId returns the newest id, or null when none/error", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ sessions: [{ id: "s1" }, { id: "s2" }] })));
    expect(await latestSessionId(ok as unknown as typeof fetch)).toBe("s1");
    const empty = vi.fn(async () => new Response(JSON.stringify({ sessions: [] })));
    expect(await latestSessionId(empty as unknown as typeof fetch)).toBeNull();
    const err = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await latestSessionId(err as unknown as typeof fetch)).toBeNull();
  });

  it("fetchTriage returns null on error (never a fake all-clear)", async () => {
    const err = vi.fn(async () => new Response("no", { status: 404 }));
    expect(await fetchTriage("s1", err as unknown as typeof fetch)).toBeNull();
  });

  it("reads return null on a transport reject (API not up yet) — no unhandled throw", async () => {
    const reject = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(latestSessionId(reject as unknown as typeof fetch)).resolves.toBeNull();
    await expect(fetchTriage("s1", reject as unknown as typeof fetch)).resolves.toBeNull();
  });
});
