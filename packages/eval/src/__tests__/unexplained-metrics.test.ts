import { describe, it, expect } from "vitest";
import { unexplainedMetrics } from "../unexplained-metrics.js";
import type { CorpusEvent } from "../corpus.js";
import type { CorpusScore } from "../score-corpus.js";

const ev = (over: Partial<CorpusEvent>): CorpusEvent => ({
  id: 0,
  event_type: "kprobe",
  process_pid: 1,
  process_binary: null,
  function_name: null,
  event_time: null,
  created_at: new Date(0),
  raw_event: {},
  true_action_id: null,
  uncertain: false,
  ...over,
});

const sc = (event_id: number, confidence: number, over: Partial<CorpusScore> = {}): CorpusScore => ({
  action_id: "a",
  action_type: "file_read",
  event_id,
  confidence,
  true_match: false,
  uncertain: false,
  ...over,
});

describe("unexplainedMetrics (D8)", () => {
  it("computes detection precision/recall against the true_unexplained set", () => {
    const events: CorpusEvent[] = [
      ev({ id: 1, true_action_id: "a" }), // explained, conf 0.9 → not flagged (TN)
      ev({ id: 2, true_action_id: "a" }), // explained, conf 0.5 → flagged (FP)
      ev({ id: 3, true_action_id: null }), // unexplained, conf 0.1 → flagged (TP)
      ev({ id: 4, true_action_id: null }), // unexplained, no correlation → flagged (TP)
      ev({ id: 5, true_action_id: null, uncertain: true }), // excluded entirely
    ];
    const scores: CorpusScore[] = [
      sc(1, 0.9, { true_match: true }),
      sc(2, 0.5),
      sc(3, 0.1),
      sc(5, 0.1, { uncertain: true }),
    ];

    const m = unexplainedMetrics(events, scores, 0.7);
    expect(m.tp).toBe(2); // events 3, 4
    expect(m.fp).toBe(1); // event 2 (reported but flagged)
    expect(m.fn).toBe(0);
    expect(m.precision).toBeCloseTo(2 / 3, 5);
    expect(m.recall).toBe(1);
  });

  it("counts a strongly-correlated unexplained event as a false negative (missed)", () => {
    const events: CorpusEvent[] = [
      ev({ id: 1, true_action_id: null }), // truly unexplained but engine over-correlated it
    ];
    const scores: CorpusScore[] = [sc(1, 0.95)]; // ≥ threshold → not flagged → missed
    const m = unexplainedMetrics(events, scores, 0.7);
    expect(m.fn).toBe(1);
    expect(m.tp).toBe(0);
    expect(m.recall).toBe(0);
  });

  it("precision and recall are vacuously 1 when nothing is flagged or unexplained", () => {
    const events: CorpusEvent[] = [ev({ id: 1, true_action_id: "a" })];
    const m = unexplainedMetrics(events, [sc(1, 0.9, { true_match: true })], 0.7);
    expect(m.precision).toBe(1); // empty flagged set → vacuously precise
    expect(m.recall).toBe(1);
    expect(m.tp).toBe(0);
    expect(m.fn).toBe(0);
  });

  it("treats an event at exactly the threshold as explained (not flagged)", () => {
    const events: CorpusEvent[] = [ev({ id: 1, true_action_id: null })];
    const m = unexplainedMetrics(events, [sc(1, 0.7)], 0.7);
    expect(m.tp).toBe(0); // 0.7 >= 0.7 → explained → not flagged
    expect(m.fn).toBe(1);
  });
});
