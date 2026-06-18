import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCorpus, actionTypes } from "../corpus.js";

const corpus = parseCorpus(
  JSON.parse(
    readFileSync(fileURLToPath(new URL("../../fixtures/corpus-real.json", import.meta.url)), "utf8")
  )
);

describe("parseCorpus (real capture)", () => {
  it("covers all five action types", () => {
    expect(actionTypes(corpus)).toEqual([
      "file_read",
      "file_write",
      "llm_call",
      "network_request",
      "tool_use",
    ]);
  });

  it("labels every event (true_action_id present: an action id or null)", () => {
    for (const e of corpus.events) {
      expect(e === undefined).toBe(false);
      expect(typeof e.true_action_id === "string" || e.true_action_id === null).toBe(true);
      expect(typeof e.uncertain).toBe("boolean");
    }
  });

  it("every true_action_id references a real action", () => {
    const ids = new Set(corpus.actions.map((a) => a.id));
    const matched = corpus.events.filter((e) => e.true_action_id !== null);
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.every((e) => e.true_action_id !== null && ids.has(e.true_action_id))).toBe(true);
  });

  it("has the file_write report as fd_install matches, not the pathless writes", () => {
    const report = corpus.actions.find((a) => a.action_name === "write_report");
    expect(report).toBeDefined();
    const trueEvents = corpus.events.filter((e) => e.true_action_id === report?.id);
    expect(trueEvents.length).toBeGreaterThan(0);
    expect(trueEvents.every((e) => e.function_name === "fd_install")).toBe(true);
    // The arm64 write syscalls exist in the corpus but are NOT labelled as the report's truth
    // (they're pathless) — they're the noise the over-correlation tail sweeps up.
    expect(corpus.events.some((e) => e.function_name === "__arm64_sys_write")).toBe(true);
  });

  it("marks the overlapping-window CDN connects uncertain (excluded from metrics)", () => {
    expect(corpus.events.some((e) => e.uncertain)).toBe(true);
  });

  it("rejects a corpus whose event references an unknown action id", () => {
    const broken = {
      name: "x",
      pod_name: "p",
      agent_pid: 1,
      actions: [
        {
          id: "a1",
          action_type: "file_read",
          action_name: "r",
          input_summary: null,
          started_at: "2026-06-14T00:00:00Z",
          ended_at: "2026-06-14T00:00:01Z",
          agent_pid: 1,
          pod_name: "p",
        },
      ],
      events: [
        {
          id: 1,
          event_type: "process_kprobe",
          process_pid: 1,
          function_name: "fd_install",
          event_time: "2026-06-14T00:00:00Z",
          created_at: "2026-06-14T00:00:00Z",
          raw_event: {},
          true_action_id: "ghost",
        },
      ],
    };
    expect(() => parseCorpus(broken)).toThrow();
  });
});
