import type { ScoredFixtureEvent } from "./score-fixture.js";

/** Attribution metrics at a single confidence threshold. */
export interface Metrics {
  readonly threshold: number;
  readonly tp: number;
  readonly fp: number;
  readonly fn: number;
  readonly precision: number;
  readonly recall: number;
}

// Precision/recall are conventionally 1 when their denominator is empty: a
// classifier that predicts nothing is vacuously precise; recall is 1 only when
// there was also nothing to find.
const PERFECT = 1;

/**
 * Precision/recall of attribution at `threshold`: an event is predicted to
 * belong to the action when its confidence is at or above the threshold.
 */
export const precisionRecall = (
  scored: readonly ScoredFixtureEvent[],
  threshold: number
): Metrics => {
  const predictedPositive = scored.filter((s) => s.confidence >= threshold);
  const tp = predictedPositive.filter((s) => s.true_match).length;
  const fp = predictedPositive.length - tp;
  const fn = scored.filter((s) => s.true_match && s.confidence < threshold).length;

  const precision = tp + fp === 0 ? PERFECT : tp / (tp + fp);
  const recall = tp + fn === 0 ? PERFECT : tp / (tp + fn);

  return { threshold, tp, fp, fn, precision, recall };
};
