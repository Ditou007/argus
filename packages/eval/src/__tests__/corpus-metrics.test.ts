import { describe, it, expect } from "vitest";
import { perActionTypeMetrics } from "../corpus-metrics.js";
import type { CorpusScore } from "../score-corpus.js";

const s = (over: Partial<CorpusScore>): CorpusScore => ({
  action_id: "a",
  action_type: "file_write",
  event_id: 0,
  confidence: 0,
  true_match: false,
  uncertain: false,
  ...over,
});

describe("perActionTypeMetrics", () => {
  it("computes P/R/F1 per type and excludes uncertain events", () => {
    const scores: CorpusScore[] = [
      s({ event_id: 1, confidence: 0.9, true_match: true }),
      s({ event_id: 2, confidence: 0.8, true_match: false }), // false positive at 0.5
      s({ event_id: 3, confidence: 0.9, true_match: false, uncertain: true }), // excluded
    ];
    const [m] = perActionTypeMetrics(scores, 0.5);
    expect(m.action_type).toBe("file_write");
    expect(m.tp).toBe(1);
    expect(m.fp).toBe(1); // would be 2 if the uncertain one were counted
    expect(m.fn).toBe(0);
    expect(m.precision).toBeCloseTo(0.5, 5);
    expect(m.recall).toBe(1);
    expect(m.f1).toBeCloseTo(2 / 3, 5);
  });

  it("raising the threshold above the noise restores precision", () => {
    const scores: CorpusScore[] = [
      s({ event_id: 1, confidence: 0.9, true_match: true }),
      s({ event_id: 2, confidence: 0.4, true_match: false }),
    ];
    const [m] = perActionTypeMetrics(scores, 0.7);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
    expect(m.f1).toBe(1);
  });

  it("returns one row per action type, sorted", () => {
    const scores: CorpusScore[] = [
      s({ action_type: "llm_call", confidence: 0.9, true_match: true }),
      s({ action_type: "file_read", confidence: 0.9, true_match: true }),
    ];
    expect(perActionTypeMetrics(scores, 0.5).map((m) => m.action_type)).toEqual([
      "file_read",
      "llm_call",
    ]);
  });
});
