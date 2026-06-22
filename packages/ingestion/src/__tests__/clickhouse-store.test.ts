import { describe, it, expect } from "vitest";
import {
  createClickHouseStore,
  toEventRow,
  EVENTS_TABLE,
  type ClickHouseClient,
} from "../clickhouse-store.js";
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

// In-memory fake of the injected ClickHouse client: records DDL commands and
// stores inserted rows so a query() can read them back — no real I/O.
const makeFakeClient = () => {
  const rows: unknown[] = [];
  const commands: string[] = [];
  const client: ClickHouseClient = {
    command: async ({ query }) => {
      commands.push(query);
    },
    insert: async ({ values }) => {
      rows.push(...values);
    },
    query: async () => [...rows],
    close: async () => {},
  };
  return { client, rows, commands };
};

describe("toEventRow — pure mapping", () => {
  it("maps process + kprobe fields and embeds the raw event", () => {
    const row = toEventRow(kprobe("read_file", { binary: "/usr/bin/cat", pid: 42 }));
    expect(row).toMatchObject({
      event_type: "process_kprobe",
      process_binary: "/usr/bin/cat",
      process_pid: 42,
      function_name: "read_file",
    });
    expect(JSON.parse(row.raw_event).process_kprobe.function_name).toBe("read_file");
  });

  it("coerces missing optional fields to ClickHouse-safe defaults (no nulls)", () => {
    const row = toEventRow({
      process_exec: { process: proc() },
      node_name: "n",
      time: "2026-06-22T00:00:00Z",
    });
    expect(row.function_name).toBe("");
    expect(row.pod_name).toBe("");
    expect(row.container_id).toBe("");
    expect(row.process_pid).toBe(100);
  });
});

describe("createClickHouseStore", () => {
  it("initialize issues the events table DDL", async () => {
    const { client, commands } = makeFakeClient();
    await createClickHouseStore(client).initialize();
    expect(commands.some((q) => q.includes(`CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE}`))).toBe(true);
  });

  it("insert lands a raw event that a query reads back (> 0 rows)", async () => {
    const { client } = makeFakeClient();
    const store = createClickHouseStore(client);
    await store.initialize();
    await store.insert(kprobe("__x64_sys_openat"));
    const got = await client.query({ query: `SELECT * FROM ${EVENTS_TABLE}` });
    expect(got.length).toBeGreaterThan(0);
  });
});
