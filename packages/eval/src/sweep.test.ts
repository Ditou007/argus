import { describe, it, expect } from "vitest";
import {
  sweepThresholds,
  recommendThreshold,
  buildBaseline,
  DEFAULT_THRESHOLDS,
  type SweepPoint,
} from "./sweep.js";
import type { CorpusEvent } from "./corpus.js";
import type { CorpusScore } from "./score-corpus.js";

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

describe("sweepThresholds", () => {
  it("emits one structured point per threshold covering the range", () => {
    const events = [ev({ id: 1, true_action_id: "a" }), ev({ id: 2, true_action_id: null })];
    const scores = [sc(1, 0.9, { true_match: true }), sc(2, 0.2)];
    const sweep = sweepThresholds(events, scores, DEFAULT_THRESHOLDS);
    expect(sweep).toHaveLength(DEFAULT_THRESHOLDS.length);
    expect(sweep[0].threshold).toBe(DEFAULT_THRESHOLDS[0]);
    for (const p of sweep) {
      expect(p.attribution).toHaveProperty("f1");
      expect(p.unexplained).toHaveProperty("recall");
    }
  });

  it("attribution precision rises as the threshold climbs past the noise", () => {
    // one true match at 0.9, one false positive at 0.4
    const events = [ev({ id: 1, true_action_id: "a" }), ev({ id: 2, true_action_id: null })];
    const scores = [sc(1, 0.9, { true_match: true }), sc(2, 0.4)];
    const sweep = sweepThresholds(events, scores, [0.3, 0.7]);
    expect(sweep[0].attribution.precision).toBeCloseTo(0.5, 5); // 0.3: tp=1, fp=1
    expect(sweep[1].attribution.precision).toBe(1); // 0.7: the 0.4 fp is dropped
  });
});

describe("recommendThreshold", () => {
  it("picks the threshold with the highest attribution F1, tie broken toward higher precision", () => {
    const events = [ev({ id: 1, true_action_id: "a" }), ev({ id: 2, true_action_id: null })];
    const scores = [sc(1, 0.9, { true_match: true }), sc(2, 0.4)];
    // at 0.7 F1 is perfect (1.0); at 0.3 it's lower (precision 0.5)
    expect(recommendThreshold(sweepThresholds(events, scores, [0.3, 0.7]))).toBe(0.7);
  });

  it("breaks an exact F1 tie toward the higher threshold", () => {
    const point = (threshold: number, f1: number): SweepPoint => ({
      threshold,
      attribution: { precision: f1, recall: f1, f1 },
      unexplained: { precision: 1, recall: 1 },
    });
    // 0.5 and 0.7 tie at F1 0.9 → the higher threshold wins, regardless of order
    expect(recommendThreshold([point(0.5, 0.9), point(0.7, 0.9), point(0.3, 0.4)])).toBe(0.7);
    expect(recommendThreshold([point(0.7, 0.9), point(0.5, 0.9)])).toBe(0.7);
  });

  it("throws on an empty sweep rather than returning a bogus threshold", () => {
    expect(() => recommendThreshold([])).toThrow(/empty/);
  });
});

describe("buildBaseline", () => {
  it("writes the recommended threshold and its metrics", () => {
    const events = [ev({ id: 1, true_action_id: "a" }), ev({ id: 2, true_action_id: null })];
    const scores = [sc(1, 0.9, { true_match: true }), sc(2, 0.4)];
    const baseline = buildBaseline(events, scores, [0.3, 0.7]);
    expect(baseline.recommended_threshold).toBe(0.7);
    expect(baseline.attribution.f1).toBe(1);
    expect(baseline.unexplained.recall).toBe(1); // event 2 (null) is flagged at 0.7
  });
});
