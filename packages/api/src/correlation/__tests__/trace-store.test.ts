import { describe, it, expect } from "vitest";
import { createTraceStore } from "../trace-store.js";
import { CORRELATED_TRACES_TABLE } from "../correlated-traces.js";
import type { ClickHouseWriter } from "../clickhouse-writer.js";
import type { CorrelatedTrace } from "../streaming-correlator.js";

const fakeWriter = () => {
  const commands: string[] = [];
  const inserts: { table: string; rows: readonly unknown[] }[] = [];
  const writer: ClickHouseWriter = {
    command: async (query) => {
      commands.push(query);
    },
    insert: async (table, rows) => {
      inserts.push({ table, rows });
    },
    close: async () => {},
  };
  return { writer, commands, inserts };
};

const trace = (attributed: CorrelatedTrace["attributed"]): CorrelatedTrace => ({
  session_id: "s1",
  action_id: "a1",
  action_type: "network_request",
  method: "multi_signal_pid",
  attributed,
  summary: {
    action_id: "a1",
    events_correlated: attributed.length,
    high_confidence: 0,
    medium_confidence: 0,
    low_confidence: 0,
    method: "multi_signal_pid",
    top_signals: [],
  },
});

const oneAttributed: CorrelatedTrace["attributed"] = [
  {
    event: {
      id: 1,
      event_type: "process_kprobe",
      process_pid: 100,
      process_binary: "/usr/bin/curl",
      function_name: "tcp_connect",
      event_time: new Date("2026-06-22T00:00:05Z"),
      created_at: new Date("2026-06-22T00:00:05Z"),
      raw_event: {},
      pod_name: null,
    },
    scored: { event_id: 1, confidence: 0.9, method: "network_destination", signal_scores: {}, reasons: [] },
  },
];

describe("createTraceStore", () => {
  it("initializes the correlated_traces table on first persist", async () => {
    const { writer, commands } = fakeWriter();
    await createTraceStore(writer).persist(trace(oneAttributed));
    expect(commands.some((q) => q.includes(`CREATE TABLE IF NOT EXISTS ${CORRELATED_TRACES_TABLE}`))).toBe(true);
  });

  it("persists the trace rows to correlated_traces", async () => {
    const { writer, inserts } = fakeWriter();
    await createTraceStore(writer).persist(trace(oneAttributed));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe(CORRELATED_TRACES_TABLE);
    expect(inserts[0].rows).toHaveLength(1);
  });

  it("does not insert when the trace has no attributed events (no empty writes)", async () => {
    const { writer, inserts } = fakeWriter();
    await createTraceStore(writer).persist(trace([]));
    expect(inserts).toHaveLength(0);
  });

  it("initializes the table only once across multiple persists", async () => {
    const { writer, commands } = fakeWriter();
    const store = createTraceStore(writer);
    await store.persist(trace(oneAttributed));
    await store.persist(trace(oneAttributed));
    const ddlCount = commands.filter((q) => q.includes("CREATE TABLE")).length;
    expect(ddlCount).toBe(1);
  });
});
