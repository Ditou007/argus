import { describe, it, expect } from "vitest";
import { formatReport } from "./report.js";
import type { Metrics } from "./metrics.js";

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
