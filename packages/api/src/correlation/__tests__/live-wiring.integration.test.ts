import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Redis } from "ioredis";
import { createClient } from "@clickhouse/client";
import { createClickHouseWriter } from "../clickhouse-writer.js";
import { createTraceStore } from "../trace-store.js";
import { createStreamingService } from "../streaming-service.js";
import { createStreamConsumer } from "../stream-consumer.js";
import { CORRELATED_TRACES_TABLE } from "../correlated-traces.js";

// Compose-gated (SPEC_04 Slice 2c): the full live path — open a window, XADD
// events to the stream, the consumer-group reader ingests them, close the action
// → trace persisted to ClickHouse. Skipped unless CH_INTEGRATION=1. Run with:
//   docker compose up -d clickhouse redis
//   CH_INTEGRATION=1 pnpm --filter @argus/api test
const RUN = process.env.CH_INTEGRATION === "1";

const STREAM_KEY = "argus:events:stream:s2c-test";
const GROUP = "argus-correlator-test";
const REDIS = { host: "localhost", port: 6379 };
const CH = {
  url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
  database: process.env.CLICKHOUSE_DB ?? "argus",
  username: process.env.CLICKHOUSE_USER ?? "argus",
  password: process.env.CLICKHOUSE_PASSWORD ?? "argus_dev",
};

const streamPayload = (id: number) =>
  JSON.stringify({
    id,
    event_type: "process_kprobe",
    process_pid: 7777,
    process_binary: "/usr/bin/curl",
    function_name: "tcp_connect",
    pod_name: null,
    event_time: "2026-06-22T00:00:05Z",
    created_at: "2026-06-22T00:00:05Z",
    raw_event: { process_kprobe: { function_name: "tcp_connect" } },
  });

describe.skipIf(!RUN)("live wiring — integration (consumer group → engine → ClickHouse)", () => {
  const redis = new Redis(REDIS);
  const writer = createClickHouseWriter(CH);
  const traceStore = createTraceStore(writer);
  const reader = createClient(CH);
  const consumerRedis = {
    xgroup: (...a: (string | number)[]) => redis.call("XGROUP", ...a),
    xreadgroup: (...a: (string | number)[]) => redis.call("XREADGROUP", ...a),
    xack: (...a: (string | number)[]) => redis.call("XACK", ...a),
  };

  beforeAll(async () => {
    await traceStore.initialize();
    await writer.command(`TRUNCATE TABLE ${CORRELATED_TRACES_TABLE}`);
    await redis.del(STREAM_KEY);
  });

  afterAll(async () => {
    await redis.del(STREAM_KEY);
    await redis.quit();
    await writer.close();
    await reader.close();
  });

  it("open → stream → consumer ingests → close persists a trace to ClickHouse", async () => {
    const service = createStreamingService({ traceStore });
    const consumer = createStreamConsumer({
      redis: consumerRedis,
      streamKey: STREAM_KEY,
      group: GROUP,
      consumer: "test-1",
      onEvent: (e) => service.ingest(e),
      onError: (err) => {
        throw err;
      },
    });

    // Group must exist (at $) before events are added, so the consumer sees them.
    await consumer.ensureGroup();
    service.openAction("act-2c", { pod_name: null, agent_pid: 7777 }, new Date("2026-06-22T00:00:00Z"));

    // Ingestion side: events land on the durable stream.
    await redis.xadd(STREAM_KEY, "*", "data", streamPayload(1));
    await redis.xadd(STREAM_KEY, "*", "data", streamPayload(2));

    // Consumer reads the batch and drives the engine.
    const processed = await consumer.pollOnce(200);
    expect(processed).toBe(2);

    const summary = await service.closeAction({
      action_id: "act-2c",
      session_id: "sess-2c",
      action_type: "network_request",
      action_name: null,
      input_summary: null,
      agent_pid: 7777,
      pod_name: null,
      ended_at: new Date("2026-06-22T00:00:10Z"),
    });
    expect(summary?.events_correlated).toBeGreaterThan(0);

    const rows = (await reader
      .query({ query: `SELECT count() AS count FROM ${CORRELATED_TRACES_TABLE} WHERE action_id = 'act-2c'`, format: "JSONEachRow" })
      .then((r) => r.json<{ count: string }>())) as { count: string }[];
    expect(Number(rows[0]?.count)).toBeGreaterThan(0);
  });
});
