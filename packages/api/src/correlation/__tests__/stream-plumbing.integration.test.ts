import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Redis } from "ioredis";
import { createClient } from "@clickhouse/client";
import { parseStreamEvent } from "../stream-event.js";
import { createStreamingCorrelator } from "../streaming-correlator.js";
import { createClickHouseWriter } from "../clickhouse-writer.js";
import { createTraceStore } from "../trace-store.js";
import { CORRELATED_TRACES_TABLE } from "../correlated-traces.js";
import type { ActionHints } from "../types.js";

// Compose-gated end-to-end plumbing test (SPEC_04 Slice 2b): publish → durable
// Redis Stream → parse → streaming engine → trace-store → real ClickHouse.
// Skipped unless CH_INTEGRATION=1. Run locally with:
//   docker compose up -d clickhouse redis
//   CH_INTEGRATION=1 pnpm --filter @argus/api test
const RUN = process.env.CH_INTEGRATION === "1";

const STREAM_KEY = "argus:events:stream:test";
const REDIS = { host: "localhost", port: 6379 };
const CH = {
  url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
  database: process.env.CLICKHOUSE_DB ?? "argus",
  username: process.env.CLICKHOUSE_USER ?? "argus",
  password: process.env.CLICKHOUSE_PASSWORD ?? "argus_dev",
};

const START = new Date("2026-06-22T00:00:00Z");
const END = new Date("2026-06-22T00:00:10Z");

const hints = (): ActionHints => ({
  action_type: "network_request",
  action_name: null,
  expected_hostnames: [],
  expected_ips: [],
  expected_ports: [],
  expected_file_paths: [],
  expected_functions: [],
  agent_pid: 4242,
  pod_name: null,
});

const streamPayload = () =>
  JSON.stringify({
    id: 1,
    event_type: "process_kprobe",
    process_pid: 4242,
    process_binary: "/usr/bin/curl",
    function_name: "tcp_connect",
    pod_name: null,
    event_time: "2026-06-22T00:00:05Z",
    created_at: "2026-06-22T00:00:05Z",
    raw_event: { process_kprobe: { function_name: "tcp_connect" } },
  });

describe.skipIf(!RUN)("stream plumbing — integration (real Redis Stream + ClickHouse)", () => {
  const redis = new Redis(REDIS);
  const writer = createClickHouseWriter(CH);
  const traceStore = createTraceStore(writer);
  const reader = createClient(CH);

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

  it("publish → stream → parse → engine → trace-store lands a correlated_traces row", async () => {
    // Ingestion side: XADD the full event to the durable stream.
    await redis.xadd(STREAM_KEY, "*", "data", streamPayload());

    // Correlator side: read the stream back, parse, drive the engine.
    const entries = await redis.xrange(STREAM_KEY, "-", "+");
    const correlator = createStreamingCorrelator();
    correlator.openAction("a1", { pod_name: null, agent_pid: 4242 }, START);
    for (const [, fields] of entries) {
      const event = parseStreamEvent(fields[fields.indexOf("data") + 1]);
      if (event) correlator.ingestEvent(event);
    }
    const trace = correlator.closeAction({
      action_id: "a1",
      session_id: "s1",
      action_type: "network_request",
      ended_at: END,
      hints: hints(),
    });
    expect(trace).not.toBeNull();
    expect(trace?.attributed.length).toBeGreaterThan(0);

    // Persist, then read back from ClickHouse to prove the row landed.
    if (trace) await traceStore.persist(trace);
    const rows = await reader
      .query({ query: `SELECT count() AS count FROM ${CORRELATED_TRACES_TABLE} WHERE action_id = 'a1'`, format: "JSONEachRow" })
      .then((r) => r.json<{ count: string }>());
    expect(Number(rows[0]?.count)).toBeGreaterThan(0);
  });
});
