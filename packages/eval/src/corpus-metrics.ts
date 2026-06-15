import { precisionRecall, type Metrics } from "./metrics.js";
import type { CorpusScore } from "./score-corpus.js";

/** Attribution metrics for one action type at a threshold, with F1. */
export interface TypeMetrics extends Metrics {
  readonly action_type: string;
  readonly f1: number;
}

const harmonic = (precision: number, recall: number): number =>
  precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

/**
 * Precision / recall / F1 per action type at a confidence threshold. Uncertain
 * events are excluded so an ambiguous labelling call never skews a metric.
 * @function perActionTypeMetrics
 * @param scores - The scored (action, event) pairs from scoreCorpus.
 * @param threshold - The confidence cutoff for a predicted correlation.
 * @returns One {@link TypeMetrics} per action type, sorted by type.
 */
export const perActionTypeMetrics = (
  scores: readonly CorpusScore[],
  threshold: number
): TypeMetrics[] => {
  const types = [...new Set(scores.map((s) => s.action_type))].sort();
  return types.map((action_type) => {
    const rows = scores
      .filter((s) => s.action_type === action_type && !s.uncertain)
      .map((s) => ({ event_id: s.event_id, confidence: s.confidence, true_match: s.true_match }));
    const m = precisionRecall(rows, threshold);
    return { ...m, action_type, f1: harmonic(m.precision, m.recall) };
  });
};
