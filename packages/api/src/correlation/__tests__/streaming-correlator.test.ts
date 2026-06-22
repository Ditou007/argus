import { describe, it, expect } from "vitest";
import { createStreamingCorrelator, type StreamEvent, type EventScorer } from "../streaming-correlator.js";
import type { ActionHints } from "../types.js";

const hints = (): ActionHints => ({
  action_type: "file_read",
  action_name: null,
  expected_hostnames: [],
  expected_ips: [],
  expected_ports: [],
  expected_file_paths: [],
  expected_functions: [],
  agent_pid: 100,
  pod_name: null,
});

const ev = (over: Partial<StreamEvent> = {}): StreamEvent => ({
  id: 1,
  event_type: "process_kprobe",
  process_pid: 100,
  process_binary: "/usr/bin/cat",
  function_name: "read",
  event_time: new Date("2026-06-22T00:00:05Z"),
  created_at: new Date("2026-06-22T00:00:05Z"),
  raw_event: {},
  pod_name: null,
  ...over,
});

// Deterministic scorer: attributes every event it is asked to score, so these
// tests exercise the windowing/accumulation logic, not the (separately tested)
// signal scoring.
const attributeAll: EventScorer = (event) => ({
  event_id: event.id,
  confidence: 0.9,
  method: "stub",
  signal_scores: { stub: 0.9 },
  reasons: [],
});

const START = new Date("2026-06-22T00:00:00Z");
const END = new Date("2026-06-22T00:00:10Z");

const open = (scorer: EventScorer = attributeAll) => {
  const c = createStreamingCorrelator({ scoreEvent: scorer });
  c.openAction("a1", { pod_name: null, agent_pid: 100 }, START);
  return c;
};

const close = (c: ReturnType<typeof open>) =>
  c.closeAction({ action_id: "a1", session_id: "s1", action_type: "file_read", ended_at: END, hints: hints() });

describe("streaming correlator — windowing", () => {
  it("accumulates streamed events and attributes them at close", () => {
    const c = open();
    c.ingestEvent(ev({ id: 1 }));
    c.ingestEvent(ev({ id: 2, function_name: "openat" }));
    const trace = close(c);
    expect(trace?.attributed).toHaveLength(2);
    expect(trace?.summary.events_correlated).toBe(2);
    expect(trace?.action_id).toBe("a1");
    expect(trace?.session_id).toBe("s1");
  });

  it("the no-race property: a fast-op event accumulated as it streamed in is attributed at close", () => {
    // A batch-at-close query could miss this event (ingestion lag); accumulation
    // captures it the instant it streamed, so it is always scored at close.
    const c = open();
    c.ingestEvent(ev({ id: 7, function_name: "connect", event_time: new Date("2026-06-22T00:00:02Z") }));
    const trace = close(c);
    expect(trace?.attributed.map((a) => a.event.id)).toContain(7);
  });

  it("dedups repeat events by id", () => {
    const c = open();
    c.ingestEvent(ev({ id: 1 }));
    c.ingestEvent(ev({ id: 1 }));
    expect(close(c)?.attributed).toHaveLength(1);
  });

  it("scopes by PID when the action has no pod (compose mode)", () => {
    const c = open();
    c.ingestEvent(ev({ id: 1, process_pid: 100 }));
    c.ingestEvent(ev({ id: 2, process_pid: 999 })); // different process — excluded
    const trace = close(c);
    expect(trace?.attributed.map((a) => a.event.id)).toEqual([1]);
  });

  it("scopes by pod_name when the action has a pod (k8s mode)", () => {
    const c = createStreamingCorrelator({ scoreEvent: attributeAll });
    c.openAction("a1", { pod_name: "agent-x", agent_pid: 100 }, START);
    c.ingestEvent(ev({ id: 1, pod_name: "agent-x", process_pid: 555 }));
    c.ingestEvent(ev({ id: 2, pod_name: "other", process_pid: 100 })); // wrong pod — excluded
    const trace = close(c);
    expect(trace?.attributed.map((a) => a.event.id)).toEqual([1]);
  });

  it("rejects events before the window (started_at - 1s) at ingest", () => {
    const c = open();
    c.ingestEvent(ev({ id: 1, event_time: new Date("2026-06-21T23:59:00Z") })); // way before
    expect(close(c)?.attributed).toHaveLength(0);
  });

  it("filters events after the window (ended_at + 1s) at close", () => {
    const c = open();
    c.ingestEvent(ev({ id: 1, event_time: new Date("2026-06-22T00:00:05Z") })); // in window
    c.ingestEvent(ev({ id: 2, event_time: new Date("2026-06-22T00:05:00Z") })); // long after
    const trace = close(c);
    expect(trace?.attributed.map((a) => a.event.id)).toEqual([1]);
  });

  it("returns null when closing an unknown action", () => {
    const c = createStreamingCorrelator({ scoreEvent: attributeAll });
    expect(
      c.closeAction({ action_id: "ghost", session_id: "s", action_type: "x", ended_at: END, hints: hints() })
    ).toBeNull();
  });

  it("tracks open action ids and drops them on close (for rehydrate accounting)", () => {
    const c = open();
    expect(c.openActionIds()).toEqual(["a1"]);
    close(c);
    expect(c.openActionIds()).toEqual([]);
  });

  it("summary bands count high/medium/low by the configured thresholds", () => {
    const byConfidence: EventScorer = (event) => ({
      event_id: event.id,
      confidence: event.id === 1 ? 0.9 : event.id === 2 ? 0.5 : 0.2, // high / medium / low
      method: "stub",
      signal_scores: {},
      reasons: [],
    });
    const c = open(byConfidence);
    c.ingestEvent(ev({ id: 1 }));
    c.ingestEvent(ev({ id: 2 }));
    c.ingestEvent(ev({ id: 3 }));
    const s = close(c)?.summary;
    expect(s?.high_confidence).toBe(1);
    expect(s?.medium_confidence).toBe(1);
    expect(s?.low_confidence).toBe(1);
  });
});
