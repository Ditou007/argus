import { describe, it, expect } from "vitest";
import { getEventType, getProcess, getEventTime, toEventFields } from "../event-fields.js";
import type { TetragonEvent, ProcessInfo } from "../types.js";

const proc = (over: Partial<ProcessInfo> = {}): ProcessInfo => ({
  exec_id: "x",
  pid: 100,
  uid: 0,
  cwd: "/app",
  binary: "/usr/local/bin/python",
  start_time: "2026-06-22T00:00:00Z",
  ...over,
});

const kprobe = (fn: string, over: Partial<ProcessInfo> = {}): TetragonEvent => ({
  process_kprobe: { process: proc(over), function_name: fn },
  node_name: "n",
  time: "2026-06-22T00:00:01Z",
});

describe("getEventType", () => {
  it("classifies each payload variant", () => {
    expect(getEventType({ process_exec: { process: proc() }, node_name: "n", time: "t" })).toBe("process_exec");
    expect(getEventType(kprobe("read"))).toBe("process_kprobe");
    expect(getEventType({ node_name: "n", time: "t" } as TetragonEvent)).toBe("unknown");
  });
});

describe("getProcess", () => {
  it("returns the process from any payload variant, else null", () => {
    expect(getProcess(kprobe("read"))?.pid).toBe(100);
    expect(getProcess({ node_name: "n", time: "t" } as TetragonEvent)).toBeNull();
  });
});

describe("getEventTime", () => {
  it("prefers the top-level event time", () => {
    expect(getEventTime(kprobe("read"))).toBe("2026-06-22T00:00:01Z");
  });

  it("falls back to process start_time when top-level time is the object placeholder", () => {
    const e = kprobe("read", { start_time: "2026-06-22T09:00:00Z" });
    e.time = "[object Object]";
    expect(getEventTime(e)).toBe("2026-06-22T09:00:00Z");
  });
});

describe("toEventFields", () => {
  it("projects process + kprobe fields", () => {
    const f = toEventFields(kprobe("read_file", { binary: "/usr/bin/cat", pid: 42 }));
    expect(f).toMatchObject({
      event_type: "process_kprobe",
      process_binary: "/usr/bin/cat",
      process_pid: 42,
      function_name: "read_file",
    });
  });

  it("yields null pod fields when no pod metadata is present (compose mode)", () => {
    const f = toEventFields(kprobe("read"));
    expect(f.pod_name).toBeNull();
    expect(f.pod_namespace).toBeNull();
    expect(f.container_id).toBeNull();
  });

  it("extracts pod + container metadata when present (k8s mode)", () => {
    const withPod = kprobe("read", {
      pod: { namespace: "default", name: "agent-xyz", container: { id: "abc123", name: "agent" } },
    });
    const f = toEventFields(withPod);
    expect(f.pod_name).toBe("agent-xyz");
    expect(f.pod_namespace).toBe("default");
    expect(f.container_id).toBe("abc123");
  });
});
