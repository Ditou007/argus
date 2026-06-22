import { describe, it, expect } from "vitest";
import { appendLiveEvent, type LiveEventData } from "./append-live-event.js";
import type { TimelineEntry } from "./api.js";

const data = (id: number): LiveEventData => ({
  id,
  event_type: "process_kprobe",
  pod_name: "",
  process_pid: 100,
  process_binary: "/usr/bin/node",
  function_name: "tcp_connect",
  event_time: "2026-06-22T00:00:00Z",
});

const timeline = (events: number[] = []): TimelineEntry[] =>
  [{ events: events.map((id) => ({ id, event_type: "x", process_binary: null, process_pid: null, function_name: null, raw_event: {}, created_at: "t" })) } as TimelineEntry];

describe("appendLiveEvent", () => {
  it("appends the event to the last action", () => {
    const out = appendLiveEvent(timeline([1]), data(2), 500, "now");
    expect(out[0].events.map((e) => e.id)).toEqual([1, 2]);
  });

  it("caps the last action's events to `max` (bounded tail)", () => {
    const out = appendLiveEvent(timeline([1, 2, 3]), data(4), 2, "now");
    expect(out[0].events.map((e) => e.id)).toEqual([3, 4]);
  });

  it("returns the timeline unchanged when empty", () => {
    expect(appendLiveEvent([], data(1), 500, "now")).toEqual([]);
  });

  it("falls back to `now` when the event has no time, and does not mutate input", () => {
    const input = timeline([1]);
    const out = appendLiveEvent(input, { ...data(2), event_time: null }, 500, "NOW");
    expect(out[0].events[1].created_at).toBe("NOW");
    expect(input[0].events).toHaveLength(1); // not mutated
  });
});
