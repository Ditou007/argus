import { describe, it, expect } from "vitest";
import { calibrationBins } from "./calibration.js";
import { formatCalibrationReport } from "./report.js";
import type { CorpusScore } from "./score-corpus.js";

const s = (over: Partial<CorpusScore>): CorpusScore => ({
  action_id: "a",
  action_type: "file_write",
  event_id: 0,
  confidence: 0,
  true_match: false,
  uncertain: false,
  ...over,
});

describe("calibrationBins", () => {
  it("bins emitted correlations into deciles with hand-computed accuracy", () => {
    const scores: CorpusScore[] = [
      s({ event_id: 1, confidence: 0.95, true_match: true }), // bin 9
      s({ event_id: 2, confidence: 0.92, true_match: false }), // bin 9
      s({ event_id: 3, confidence: 0.7, true_match: true }), // bin 7
      s({ event_id: 4, confidence: 0.72, true_match: true }), // bin 7
      s({ event_id: 5, confidence: 0.48, true_match: false }), // bin 4
    ];
    const bins = calibrationBins(scores);

    expect(bins).toHaveLength(10);

    const bin9 = bins[9];
    expect(bin9.count).toBe(2);
    expect(bin9.trueMatches).toBe(1);
    expect(bin9.accuracy).toBeCloseTo(0.5, 5);

    const bin7 = bins[7];
    expect(bin7.count).toBe(2);
    expect(bin7.accuracy).toBe(1);

    const bin4 = bins[4];
    expect(bin4.count).toBe(1);
    expect(bin4.accuracy).toBe(0);

    // every other bin is empty — an empty band reports accuracy 0, never NaN from 0/0
    expect(bins[0].count).toBe(0);
    expect(bins[0].accuracy).toBe(0);
    expect(bins[5].count).toBe(0);
    expect(bins[5].accuracy).toBe(0);
  });

  it("excludes non-correlations (confidence 0) and uncertain events", () => {
    const scores: CorpusScore[] = [
      s({ event_id: 1, confidence: 0, true_match: false }), // not emitted
      s({ event_id: 2, confidence: 0.9, true_match: true, uncertain: true }), // ambiguous
      s({ event_id: 3, confidence: 0.9, true_match: true }), // the only counted row
    ];
    const bins = calibrationBins(scores);
    expect(bins[9].count).toBe(1);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(1);
  });

  it("places boundary confidences in the upper bin despite float error", () => {
    // 0.6 in IEEE-754 is slightly below 0.6, so a naive floor(0.6*10) lands in bin 5
    const scores: CorpusScore[] = [
      s({ event_id: 1, confidence: 0.6, true_match: true }),
      s({ event_id: 2, confidence: 0.3, true_match: true }),
      s({ event_id: 3, confidence: 1, true_match: true }), // top bin, inclusive
    ];
    const bins = calibrationBins(scores);
    expect(bins[6].count).toBe(1);
    expect(bins[3].count).toBe(1);
    expect(bins[9].count).toBe(1);
    expect(bins[5].count).toBe(0);
  });
});

describe("formatCalibrationReport", () => {
  it("renders a deterministic table with bands, counts, and observed accuracy", () => {
    const scores: CorpusScore[] = [
      s({ confidence: 0.72, true_match: true }),
      s({ confidence: 0.74, true_match: true }),
      s({ confidence: 0.95, true_match: true }),
      s({ confidence: 0.92, true_match: false }),
    ];
    const out = formatCalibrationReport(calibrationBins(scores));
    // title + header + one row per decile, deterministically
    expect(out.split("\n")).toHaveLength(2 + 10);
    expect(out).toContain("calibration");
    expect(out).toContain("0.7-0.8");
    expect(out).toContain("0.9-1.0");
    // 0.7-0.8: 2 emitted, both true → 100%
    expect(out).toMatch(/0\.7-0\.8\s+2\s+100\.0%/);
    // 0.9-1.0: 2 emitted, 1 true → 50%
    expect(out).toMatch(/0\.9-1\.0\s+2\s+50\.0%/);
    // empty bins show a placeholder, not a misleading 0.0%
    expect(out).toContain("—");
  });
});
