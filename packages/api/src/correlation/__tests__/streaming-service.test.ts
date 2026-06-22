import { describe, it, expect } from "vitest";
import { createStreamingService } from "../streaming-service.js";
import type { StreamEvent,CorrelatedTrace } from "../streaming-correlator.js";

const ev = (over: Partial<StreamEvent> = {}): StreamEvent => ({
  id: 1,
  event_type: "process_kprobe",
  process_pid: 4242,
  process_binary: "/usr/bin/curl",
  function_name: "tcp_connect",
  event_time: new Date("2026-06-22T00:00:05Z"),
  created_at: new Date("2026-06-22T00:00:05Z"),
  raw_event: {},
  pod_name: null,
  ...over,
});

const fakeTraceStore = () => {
  const persisted: CorrelatedTrace[] = [];
  return { store: { persist: async (t: CorrelatedTrace) => void persisted.push(t) }, persisted };
};

const closeInput = (over: Record<string, unknown> = {}) => ({
  action_id: "a1",
  session_id: "s1",
  action_type: "network_request",
  action_name: null,
  input_summary: null,
  agent_pid: 4242,
  pod_name: null,
  started_at: new Date("2026-06-22T00:00:00Z"),
  ended_at: new Date("2026-06-22T00:00:10Z"),
  ...over,
});

describe("createStreamingService", () => {
  it("opens a window, ingests a matching event, and persists the trace on close", async () => {
    const { store, persisted } = fakeTraceStore();
    const svc = createStreamingService({ traceStore: store });
    svc.openAction("a1", { pod_name: null, agent_pid: 4242 }, new Date("2026-06-22T00:00:00Z"));
    svc.ingest(ev());
    const summary = await svc.closeAction(closeInput());
    expect(summary?.events_correlated).toBeGreaterThan(0);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].action_id).toBe("a1");
  });

  it("resolves expected hostnames to IPs via the injected DNS resolver before scoring", async () => {
    const resolved: string[] = [];
    const dns = {
      resolveAll: async (hosts: string[]) => {
        resolved.push(...hosts);
        return ["1.2.3.4"];
      },
    };
    const { store } = fakeTraceStore();
    const svc = createStreamingService({ traceStore: store, dns });
    svc.openAction("a1", { pod_name: null, agent_pid: 4242 }, new Date("2026-06-22T00:00:00Z"));
    svc.ingest(ev());
    // input_summary with a URL → parseActionHints extracts the hostname → DNS resolved
    await svc.closeAction(closeInput({ action_type: "network_request", input_summary: "GET https://evil.example.com/x" }));
    expect(resolved).toContain("evil.example.com");
  });

  it("returns null and does not persist when the action was never opened", async () => {
    const { store, persisted } = fakeTraceStore();
    const svc = createStreamingService({ traceStore: store });
    const summary = await svc.closeAction(closeInput({ action_id: "ghost" }));
    expect(summary).toBeNull();
    expect(persisted).toHaveLength(0);
  });
});
