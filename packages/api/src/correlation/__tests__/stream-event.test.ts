import { describe, it, expect } from "vitest";
import { parseStreamEvent } from "../stream-event.js";

const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 42,
    event_type: "process_kprobe",
    process_pid: 100,
    process_binary: "/usr/bin/curl",
    function_name: "tcp_connect",
    pod_name: null,
    event_time: "2026-06-22T00:00:05Z",
    created_at: "2026-06-22T00:00:05Z",
    raw_event: { process_kprobe: { function_name: "tcp_connect" } },
    ...over,
  });

describe("parseStreamEvent", () => {
  it("parses a published payload into a StreamEvent with Date fields", () => {
    const e = parseStreamEvent(payload());
    expect(e).not.toBeNull();
    expect(e?.id).toBe(42);
    expect(e?.process_pid).toBe(100);
    expect(e?.function_name).toBe("tcp_connect");
    expect(e?.event_time).toBeInstanceOf(Date);
    expect(e?.event_time?.toISOString()).toBe("2026-06-22T00:00:05.000Z");
    expect(e?.raw_event).toMatchObject({ process_kprobe: { function_name: "tcp_connect" } });
    expect(e?.pod_name).toBeNull();
  });

  it("preserves pod_name when present (k8s mode)", () => {
    expect(parseStreamEvent(payload({ pod_name: "agent-x" }))?.pod_name).toBe("agent-x");
  });

  it("handles a null event_time and falls back created_at", () => {
    const e = parseStreamEvent(payload({ event_time: null, created_at: "2026-06-22T00:00:09Z" }));
    expect(e?.event_time).toBeNull();
    expect(e?.created_at.toISOString()).toBe("2026-06-22T00:00:09.000Z");
  });

  it("returns null on malformed JSON", () => {
    expect(parseStreamEvent("{not json")).toBeNull();
  });

  it("returns null when the id is missing or not a number (cannot dedup/attribute)", () => {
    expect(parseStreamEvent(JSON.stringify({ event_type: "x" }))).toBeNull();
    expect(parseStreamEvent(JSON.stringify({ id: "nope" }))).toBeNull();
  });
});
