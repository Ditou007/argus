import { describe, it, expect } from "vitest";
import { toTraceRows, CORRELATED_TRACES_TABLE, CORRELATED_TRACES_DDL } from "../correlated-traces.js";
import type { CorrelatedTrace } from "../streaming-correlator.js";

const trace = (): CorrelatedTrace => ({
  session_id: "s1",
  action_id: "a1",
  action_type: "network_request",
  method: "multi_signal_pid",
  attributed: [
    {
      event: {
        id: 1,
        event_type: "process_kprobe",
        process_pid: 100,
        process_binary: "/usr/bin/curl",
        function_name: "tcp_connect",
        event_time: new Date("2026-06-22T00:00:05Z"),
        created_at: new Date("2026-06-22T00:00:05Z"),
        raw_event: { process_kprobe: { function_name: "tcp_connect" } },
        pod_name: null,
      },
      scored: {
        event_id: 1,
        confidence: 0.91,
        method: "network_destination",
        signal_scores: { network_destination: 0.91 },
        reasons: ["dst 1.1.1.1 matches expected egress"],
      },
    },
  ],
  summary: {
    action_id: "a1",
    events_correlated: 1,
    high_confidence: 1,
    medium_confidence: 0,
    low_confidence: 0,
    method: "multi_signal_pid",
    top_signals: ["network_destination"],
  },
});

describe("correlated_traces DDL", () => {
  it("creates the table idempotently with the expected name", () => {
    expect(CORRELATED_TRACES_DDL).toContain(`CREATE TABLE IF NOT EXISTS ${CORRELATED_TRACES_TABLE}`);
  });
});

describe("toTraceRows", () => {
  it("maps each attributed event to a denormalized trace row", () => {
    const rows = toTraceRows(trace());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      session_id: "s1",
      action_id: "a1",
      action_type: "network_request",
      process_pid: 100,
      process_binary: "/usr/bin/curl",
      function_name: "tcp_connect",
      event_time: "2026-06-22T00:00:05.000Z",
      confidence: 0.91,
      method: "network_destination",
    });
  });

  it("serializes signal_scores, reasons, and raw_event to JSON strings (forensic narrative travels)", () => {
    const [row] = toTraceRows(trace());
    expect(JSON.parse(row.signal_scores)).toEqual({ network_destination: 0.91 });
    expect(JSON.parse(row.reasons)).toEqual(["dst 1.1.1.1 matches expected egress"]);
    expect(JSON.parse(row.raw_event).process_kprobe.function_name).toBe("tcp_connect");
  });

  it("coerces null binary/function to '' and falls back event_time to the ingest time", () => {
    const t = trace();
    const rows = toTraceRows({
      ...t,
      attributed: [
        {
          ...t.attributed[0],
          event: {
            ...t.attributed[0].event,
            process_binary: null,
            function_name: null,
            event_time: null,
            created_at: new Date("2026-06-22T00:00:09Z"),
          },
        },
      ],
    });
    expect(rows[0].process_binary).toBe("");
    expect(rows[0].function_name).toBe("");
    expect(rows[0].event_time).toBe("2026-06-22T00:00:09.000Z");
  });
});
