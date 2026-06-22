import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClickHouseClient } from "../clickhouse-client.js";
import { createClickHouseStore, EVENTS_TABLE } from "../clickhouse-store.js";
import type { TetragonEvent } from "../types.js";

// Compose-gated integration test: exercises the REAL @clickhouse/client adapter
// against a running ClickHouse (the SPEC_04 Slice 1 acceptance — capture lands +
// is queryable). Skipped unless CH_INTEGRATION=1, so the default unit run and CI
// stay green without a ClickHouse. Run locally with:
//   docker compose up -d clickhouse
//   CH_INTEGRATION=1 pnpm --filter @argus/ingestion test
const RUN = process.env.CH_INTEGRATION === "1";

const CONFIG = {
  url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
  database: process.env.CLICKHOUSE_DB ?? "argus",
  username: process.env.CLICKHOUSE_USER ?? "argus",
  password: process.env.CLICKHOUSE_PASSWORD ?? "argus_dev",
};

const event: TetragonEvent = {
  process_kprobe: {
    process: {
      exec_id: "e1",
      pid: 4242,
      uid: 0,
      cwd: "/app",
      binary: "/usr/bin/cat",
      start_time: "2026-06-22T12:00:00Z",
    },
    function_name: "security_file_open",
  },
  node_name: "verify",
  time: "2026-06-22T12:00:01Z",
};

describe.skipIf(!RUN)("ClickHouse store — integration (real server)", () => {
  const client = createClickHouseClient(CONFIG);
  const store = createClickHouseStore(client);

  beforeAll(async () => {
    await store.initialize();
    await client.command({ query: `TRUNCATE TABLE ${EVENTS_TABLE}` });
  });

  afterAll(async () => {
    await client.close();
  });

  it("inserts a raw event that is queryable back with its fields intact", async () => {
    await store.insert(event);
    const rows = (await client.query({
      query: `SELECT count() AS count, any(process_binary) AS bin, any(function_name) AS fn FROM ${EVENTS_TABLE}`,
    })) as ReadonlyArray<{ count: string; bin: string; fn: string }>;
    expect(Number(rows[0]?.count)).toBeGreaterThan(0);
    expect(rows[0]?.bin).toBe("/usr/bin/cat");
    expect(rows[0]?.fn).toBe("security_file_open");
  });
});
