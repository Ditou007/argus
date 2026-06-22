import { describe, it, expect } from "vitest";
import { createStreamingService, type DeferScheduler } from "../streaming-service.js";
import type { StreamEvent, CorrelatedTrace } from "../streaming-correlator.js";

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

// Manual scheduler: captures deferred finalizers so the test controls "settle"
// time deterministically (no real timers). runAll awaits each (persist is async).
const manualScheduler = () => {
  const pending: Array<() => void | Promise<void>> = [];
  const scheduler: DeferScheduler = { defer: (fn) => void pending.push(fn) };
  return { scheduler, runAll: async () => { for (const fn of pending) await fn(); } };
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

describe("createStreamingService — settle window", () => {
  it("persists the trace only after the settle delay, not at close", async () => {
    const { store, persisted } = fakeTraceStore();
    const { scheduler, runAll } = manualScheduler();
    const svc = createStreamingService({ traceStore: store, scheduler, settleMs: 60_000 });
    svc.openAction("a1", { pod_name: null, agent_pid: 4242 }, new Date("2026-06-22T00:00:00Z"));
    svc.ingest(ev());
    await svc.closeAction(closeInput());
    expect(persisted).toHaveLength(0); // not persisted at close — settle pending
    await runAll();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].action_id).toBe("a1");
    expect(persisted[0].summary.events_correlated).toBeGreaterThan(0);
  });

  it("attributes an event that arrives AFTER close but BEFORE settle (finding #1 regression)", async () => {
    // The live pipeline lags ~10-60s, so the action's events reach the stream
    // after the sub-second action already ended. The settle window keeps the
    // window open so the late event is still accumulated and scored.
    const { store, persisted } = fakeTraceStore();
    const { scheduler, runAll } = manualScheduler();
    const svc = createStreamingService({ traceStore: store, scheduler, settleMs: 60_000 });
    svc.openAction("a1", { pod_name: null, agent_pid: 4242 }, new Date("2026-06-22T00:00:00Z"));
    await svc.closeAction(closeInput()); // action ends before any event streamed in
    svc.ingest(ev({ id: 9, event_time: new Date("2026-06-22T00:00:05Z") })); // late arrival, in-window time
    await runAll();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].attributed.map((a) => a.event.id)).toContain(9);
  });

  it("resolves expected hostnames to IPs via the injected DNS resolver at close", async () => {
    const resolved: string[] = [];
    const dns = { resolveAll: async (hosts: string[]) => { resolved.push(...hosts); return ["1.2.3.4"]; } };
    const { store } = fakeTraceStore();
    const { scheduler } = manualScheduler();
    const svc = createStreamingService({ traceStore: store, dns, scheduler, settleMs: 0 });
    svc.openAction("a1", { pod_name: null, agent_pid: 4242 }, new Date("2026-06-22T00:00:00Z"));
    svc.ingest(ev());
    await svc.closeAction(closeInput({ action_type: "network_request", input_summary: "GET https://evil.example.com/x" }));
    expect(resolved).toContain("evil.example.com"); // hints resolved at close, before settle
  });

  it("persists nothing when the action was never opened, even after settle", async () => {
    const { store, persisted } = fakeTraceStore();
    const { scheduler, runAll } = manualScheduler();
    const svc = createStreamingService({ traceStore: store, scheduler, settleMs: 60_000 });
    await svc.closeAction(closeInput({ action_id: "ghost" }));
    await runAll();
    expect(persisted).toHaveLength(0);
  });
});
