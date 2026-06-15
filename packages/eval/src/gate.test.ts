import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_CORRELATION_CONFIG } from "@argus/api/correlation/config";
import { checkRegression } from "./gate.js";
import { sweepThresholds, type Baseline } from "./sweep.js";
import { parseCorpus } from "./corpus.js";
import { scoreCorpus } from "./score-corpus.js";

const baseline: Baseline = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/baseline.json", import.meta.url)), "utf8")
);

describe("checkRegression", () => {
  it("passes when current metrics meet the baseline", () => {
    const current = {
      attribution_f1: baseline.attribution.f1,
      unexplained_recall: baseline.unexplained.recall,
    };
    expect(checkRegression(current, baseline).ok).toBe(true);
  });

  it("fails and names the metric when attribution F1 regresses", () => {
    const current = { attribution_f1: 0.1, unexplained_recall: baseline.unexplained.recall };
    const result = checkRegression(current, baseline);
    expect(result.ok).toBe(false);
    expect(result.failures.join()).toContain("attribution F1");
  });

  it("fails and names the metric when unexplained recall regresses", () => {
    const current = { attribution_f1: baseline.attribution.f1, unexplained_recall: 0.2 };
    const result = checkRegression(current, baseline);
    expect(result.ok).toBe(false);
    expect(result.failures.join()).toContain("unexplained recall");
  });

  it("tolerates a small dip within tolerance", () => {
    const current = {
      attribution_f1: baseline.attribution.f1 - 0.04,
      unexplained_recall: baseline.unexplained.recall,
    };
    expect(checkRegression(current, baseline, 0.05).ok).toBe(true);
  });
});

describe("gate catches a degraded engine config (D10)", () => {
  const corpus = parseCorpus(
    JSON.parse(
      readFileSync(fileURLToPath(new URL("../fixtures/corpus-real.json", import.meta.url)), "utf8")
    )
  );

  it("flips to non-ok when a degraded config tanks the scores", () => {
    // discard almost everything → true matches fall below the band → F1 collapses
    const degraded = { ...DEFAULT_CORRELATION_CONFIG, discardThreshold: 0.99 };
    const scores = scoreCorpus(corpus, degraded);
    const point = sweepThresholds(corpus.events, scores, [baseline.recommended_threshold])[0];
    const result = checkRegression(
      { attribution_f1: point.attribution.f1, unexplained_recall: point.unexplained.recall },
      baseline
    );
    expect(result.ok).toBe(false);
    expect(result.failures.join()).toContain("attribution F1");
  });
});
