import { precisionRecall } from "./metrics.js";
import { unexplainedMetrics } from "./unexplained-metrics.js";
import type { CorpusEvent } from "./corpus.js";
import type { CorpusScore } from "./score-corpus.js";

/** The default confidence thresholds swept over the corpus. */
export const DEFAULT_THRESHOLDS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] as const;

/** Attribution + unexplained-detection metrics at one threshold. */
export interface SweepPoint {
  readonly threshold: number;
  readonly attribution: { readonly precision: number; readonly recall: number; readonly f1: number };
  readonly unexplained: { readonly precision: number; readonly recall: number };
}

/** The recommended operating point and its metrics — the committed regression baseline. */
export interface Baseline {
  readonly recommended_threshold: number;
  readonly attribution: { readonly precision: number; readonly recall: number; readonly f1: number };
  readonly unexplained: { readonly precision: number; readonly recall: number };
}

const harmonic = (precision: number, recall: number): number =>
  precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

// The sweep point with the highest attribution F1; ties go to the higher
// threshold (favouring precision). Throws on an empty sweep — callers must pass
// at least one threshold.
const bestPoint = (sweep: readonly SweepPoint[]): SweepPoint => {
  if (sweep.length === 0) throw new Error("sweep is empty — pass at least one threshold");
  return sweep.reduce((best, p) =>
    p.attribution.f1 > best.attribution.f1 ||
    (p.attribution.f1 === best.attribution.f1 && p.threshold > best.threshold)
      ? p
      : best
  );
};

/**
 * Sweep the confidence threshold, reporting micro-averaged attribution P/R/F1
 * and unexplained-detection P/R at each. Uncertain pairs are excluded.
 * @function sweepThresholds
 * @param events - The corpus events with ground-truth labels.
 * @param scores - The scored (action, event) pairs from scoreCorpus.
 * @param thresholds - The thresholds to evaluate, ascending.
 * @returns One {@link SweepPoint} per threshold.
 */
export const sweepThresholds = (
  events: readonly CorpusEvent[],
  scores: readonly CorpusScore[],
  thresholds: readonly number[]
): SweepPoint[] => {
  const rows = scores
    .filter((s) => !s.uncertain)
    .map((s) => ({ event_id: s.event_id, confidence: s.confidence, true_match: s.true_match }));
  return thresholds.map((threshold) => {
    const m = precisionRecall(rows, threshold);
    const u = unexplainedMetrics(events, scores, threshold);
    return {
      threshold,
      attribution: { precision: m.precision, recall: m.recall, f1: harmonic(m.precision, m.recall) },
      unexplained: { precision: u.precision, recall: u.recall },
    };
  });
};

/**
 * Recommend the operating threshold: the one with the highest attribution F1,
 * ties broken toward the higher threshold (favouring precision for the security
 * story — fewer false correlations and fewer false "unexplained" flags).
 * @function recommendThreshold
 * @param sweep - The non-empty sweep points to choose from.
 * @returns The recommended threshold.
 */
export const recommendThreshold = (sweep: readonly SweepPoint[]): number => bestPoint(sweep).threshold;

/**
 * Build the committed regression baseline: the recommended threshold and the
 * metrics observed there.
 * @function buildBaseline
 * @param events - The corpus events with ground-truth labels.
 * @param scores - The scored (action, event) pairs from scoreCorpus.
 * @param thresholds - The non-empty thresholds to sweep.
 * @returns The {@link Baseline}.
 */
export const buildBaseline = (
  events: readonly CorpusEvent[],
  scores: readonly CorpusScore[],
  thresholds: readonly number[]
): Baseline => {
  const point = bestPoint(sweepThresholds(events, scores, thresholds));
  return {
    recommended_threshold: point.threshold,
    attribution: point.attribution,
    unexplained: point.unexplained,
  };
};
