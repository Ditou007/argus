import { describe, it, expect, vi } from "vitest";
import { runCli } from "../cli.js";

const triage = {
  total: 10,
  explained: 2,
  unexplained: 1,
  coverage_ratio: 0.2,
  risk_score: 1,
  events: [
    {
      id: 1,
      event_type: "process_kprobe",
      function_name: "fd_install",
      process_binary: "/usr/local/bin/node",
      resource: { kind: "file", path: "/root/.ssh/id_rsa" },
      best_confidence: 0,
      sensitivity: "high",
      risk: 1,
    },
  ],
};

describe("runCli", () => {
  it("resolves the latest session, fetches its triage, and prints the formatted view", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/sessions")) return new Response(JSON.stringify({ sessions: [{ id: "sess-1" }] }));
      if (url.includes("/unexplained")) return new Response(JSON.stringify(triage));
      throw new Error(`unexpected url ${url}`);
    });
    const lines: string[] = [];
    const code = await runCli({ apiBase: "http://api", fetch: fetchMock as unknown as typeof fetch, out: (s) => lines.push(s) });

    expect(code).toBe(0);
    const out = lines.join("\n");
    expect(out).toContain("Read credential file /root/.ssh/id_rsa");
    expect(fetchMock).toHaveBeenCalledWith("http://api/api/sessions/sess-1/unexplained");
  });

  it("uses an explicit session id when given", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(triage)));
    const lines: string[] = [];
    const code = await runCli({ apiBase: "http://api", sessionId: "abc", fetch: fetchMock as unknown as typeof fetch, out: (s) => lines.push(s) });
    expect(code).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith("http://api/api/sessions/abc/unexplained");
  });

  it("returns a non-zero code and a message when there are no sessions", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sessions: [] })));
    const lines: string[] = [];
    const code = await runCli({ apiBase: "http://api", fetch: fetchMock as unknown as typeof fetch, out: (s) => lines.push(s) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/no sessions/i);
  });

  it("reports an error (NOT a false all-clear) when the API call fails", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    const lines: string[] = [];
    const code = await runCli({ apiBase: "http://api", sessionId: "abc", fetch: fetchMock as unknown as typeof fetch, out: (s) => lines.push(s) });
    expect(code).toBe(1);
    const out = lines.join("\n");
    expect(out).toMatch(/could not reach the argus api/i);
    // must never look like a success all-clear (no ✓ verdict, no 100% coverage)
    expect(out).not.toContain("✓");
    expect(out).not.toContain("100% coverage");
  });
});
