import { describe, it, expect } from "vitest";
import { createStreamPublisher, EVENT_STREAM_KEY } from "../stream-publisher.js";
import type { TetragonEvent } from "../types.js";

const event = (over: Partial<{ fn: string; pid: number }> = {}): TetragonEvent => ({
  process_kprobe: {
    process: {
      exec_id: "x",
      pid: over.pid ?? 100,
      uid: 0,
      cwd: "/app",
      binary: "/usr/bin/curl",
      start_time: "2026-06-22T00:00:00Z",
    },
    function_name: over.fn ?? "tcp_connect",
  },
  node_name: "n",
  time: "2026-06-22T00:00:05Z",
});

const fakeRedis = () => {
  const calls: (string | number)[][] = [];
  return {
    calls,
    xadd: async (...args: (string | number)[]) => {
      calls.push(args);
      return "1-0";
    },
  };
};

describe("createStreamPublisher", () => {
  it("XADDs the full event payload to the durable stream with a MAXLEN cap", async () => {
    const redis = fakeRedis();
    await createStreamPublisher(redis, () => "2026-06-22T00:00:05Z").publish(event(), 42);

    const [args] = redis.calls;
    expect(args[0]).toBe(EVENT_STREAM_KEY);
    expect(args.slice(1, 4)).toEqual(["MAXLEN", "~", expect.any(String)]);
    // ... "*" auto-id, then field "data" with the JSON payload
    const dataIdx = args.indexOf("data");
    expect(dataIdx).toBeGreaterThan(0);
    const payload = JSON.parse(String(args[dataIdx + 1]));
    expect(payload).toMatchObject({
      id: 42,
      event_type: "process_kprobe",
      process_pid: 100,
      process_binary: "/usr/bin/curl",
      function_name: "tcp_connect",
      event_time: "2026-06-22T00:00:05Z",
    });
    // The FULL raw event travels (the streaming correlator needs sock/file args to score)
    expect(payload.raw_event.process_kprobe.function_name).toBe("tcp_connect");
  });

  it("carries pod_name null in compose mode (pid-scoped attribution downstream)", async () => {
    const redis = fakeRedis();
    await createStreamPublisher(redis, () => "t").publish(event(), 1);
    const args = redis.calls[0];
    const payload = JSON.parse(String(args[args.indexOf("data") + 1]));
    expect(payload.pod_name).toBeNull();
  });
});
