import { describe, it, expect } from "vitest";
import { createStreamConsumer, parseStreamReply } from "../stream-consumer.js";
import type { StreamEvent } from "../streaming-correlator.js";

const payload = (id: number) =>
  JSON.stringify({
    id,
    event_type: "process_kprobe",
    process_pid: 100,
    process_binary: "/usr/bin/cat",
    function_name: "read",
    pod_name: null,
    event_time: "2026-06-22T00:00:05Z",
    created_at: "2026-06-22T00:00:05Z",
    raw_event: {},
  });

// Shape of an ioredis XREADGROUP reply: [[streamKey, [[entryId, [f, v, ...]], ...]]].
const reply = (entries: [string, string][]) => [
  ["argus:events:stream", entries.map(([entryId, data]) => [entryId, ["data", data]])],
];

describe("parseStreamReply", () => {
  it("flattens the nested XREADGROUP reply into entry id + fields", () => {
    const entries = parseStreamReply(reply([["1-0", payload(1)], ["2-0", payload(2)]]));
    expect(entries.map((e) => e.id)).toEqual(["1-0", "2-0"]);
    expect(entries[0].fields).toContain("data");
  });

  it("returns [] for a null reply (block timeout)", () => {
    expect(parseStreamReply(null)).toEqual([]);
  });
});

const fakeRedis = (replies: unknown[]) => {
  const acked: string[] = [];
  let groupCreated = false;
  let call = 0;
  return {
    acked,
    get groupCreated() {
      return groupCreated;
    },
    xgroup: async () => {
      groupCreated = true;
      return "OK";
    },
    xreadgroup: async () => replies[call++] ?? null,
    xack: async (...args: (string | number)[]) => {
      // args = [streamKey, group, ...entryIds]
      const ids = args.slice(2).map(String);
      acked.push(...ids);
      return ids.length;
    },
  };
};

describe("createStreamConsumer.pollOnce", () => {
  it("parses entries, drives onEvent, and acks every entry", async () => {
    const got: StreamEvent[] = [];
    const redis = fakeRedis([reply([["1-0", payload(1)], ["2-0", payload(2)]])]);
    const consumer = createStreamConsumer({
      redis,
      streamKey: "argus:events:stream",
      group: "argus-correlator",
      consumer: "c1",
      onEvent: (e) => got.push(e),
      onError: () => {},
    });
    const n = await consumer.pollOnce(0);
    expect(n).toBe(2);
    expect(got.map((e) => e.id)).toEqual([1, 2]);
    expect(redis.acked).toEqual(["1-0", "2-0"]);
  });

  it("acks an unparseable entry too (poison message — avoid redelivery storms)", async () => {
    const got: StreamEvent[] = [];
    const redis = fakeRedis([reply([["9-0", "{garbage"]])]);
    const consumer = createStreamConsumer({
      redis,
      streamKey: "argus:events:stream",
      group: "g",
      consumer: "c1",
      onEvent: (e) => got.push(e),
      onError: () => {},
    });
    await consumer.pollOnce(0);
    expect(got).toHaveLength(0);
    expect(redis.acked).toEqual(["9-0"]);
  });

  it("ensureGroup creates the consumer group (idempotently tolerating BUSYGROUP)", async () => {
    const redis = fakeRedis([]);
    const consumer = createStreamConsumer({
      redis,
      streamKey: "s",
      group: "g",
      consumer: "c1",
      onEvent: () => {},
      onError: () => {},
    });
    await consumer.ensureGroup();
    expect(redis.groupCreated).toBe(true);
  });
});
