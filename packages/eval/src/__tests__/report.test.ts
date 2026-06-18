import { describe, it, expect } from "vitest";
import { formatReport, formatCorpusReport } from "../report.js";
import type { Metrics } from "../metrics.js";
import type { TypeMetrics } from "../corpus-metrics.js";

describe("formatReport", () => {
  it("renders precision/recall with counts deterministically", () => {
    const metrics: Metrics = {
      threshold: 0.3,
      tp: 2,
      fp: 1,
      fn: 0,
      precision: 2 / 3,
      recall: 1,
    };
    const report = formatReport("llm_call_decoy", metrics);
    expect(report).toContain("fixture:   llm_call_decoy");
    expect(report).toContain("threshold: 0.3");
    expect(report).toContain("precision: 66.7% (tp=2 fp=1)");
    expect(report).toContain("recall:    100.0% (fn=0)");
  });
});

describe("formatCorpusReport", () => {
  it("renders a per-type table with the threshold", () => {
    const byType: TypeMetrics[] = [
      { action_type: "file_write", threshold: 0.3, tp: 4, fp: 26, fn: 0, precision: 4 / 30, recall: 1, f1: 0.24 },
      { action_type: "llm_call", threshold: 0.3, tp: 10, fp: 0, fn: 0, precision: 1, recall: 1, f1: 1 },
    ];
    const out = formatCorpusReport(0.3, byType);
    expect(out).toContain("corpus metrics @ threshold 0.3");
    expect(out).toContain("file_write");
    expect(out).toContain("(4/26/0)");
    expect(out).toContain("llm_call");
  });
});
