import { detectUnexplained } from "@argus/api/correlation/unexplained";
import type { CorpusEvent } from "./corpus.js";
import type { CorpusScore } from "./score-corpus.js";

/** Detection accuracy against the labelled `true_unexplained` set, at a threshold. */
export interface UnexplainedMetrics {
  readonly threshold: number;
  readonly tp: number; // flagged AND truly unexplained
  readonly fp: number; // flagged BUT truly explained (a reported event wrongly flagged)
  readonly fn: number; // truly unexplained BUT not flagged (a syscall we missed)
  readonly precision: number;
  readonly recall: number;
}

// Precision/recall are 1 when their denominator is empty: flagging nothing is
// vacuously precise; recall is 1 only when there was also nothing to find.
const PERFECT = 1;

/**
 * Measure unexplained-behaviour detection precision/recall against ground truth.
 * An event is truly unexplained when no action caused it (`true_action_id` null);
 * it is detected when its strongest correlation to any action is below threshold.
 * Uncertain events are excluded so an ambiguous label never skews a metric.
 * @function unexplainedMetrics
 * @param events - The corpus events carrying ground-truth labels.
 * @param scores - The scored (action, event) pairs from scoreCorpus.
 * @param threshold - The confidence at or above which an event counts as explained.
 * @returns Detection {@link UnexplainedMetrics}.
 */
export const unexplainedMetrics = (
  events: readonly CorpusEvent[],
  scores: readonly CorpusScore[],
  threshold: number
): UnexplainedMetrics => {
  const considered = events.filter((e) => !e.uncertain);
  const pairs = scores
    .filter((s) => !s.uncertain)
    .map((s) => ({ event_id: s.event_id, confidence: s.confidence }));
  const flagged = new Set(detectUnexplained(considered.map((e) => e.id), pairs, threshold));

  const flaggedEvents = considered.filter((e) => flagged.has(e.id));
  const tp = flaggedEvents.filter((e) => e.true_action_id === null).length;
  const fp = flaggedEvents.length - tp;
  const fn = considered.filter((e) => e.true_action_id === null && !flagged.has(e.id)).length;

  const precision = tp + fp === 0 ? PERFECT : tp / (tp + fp);
  const recall = tp + fn === 0 ? PERFECT : tp / (tp + fn);
  return { threshold, tp, fp, fn, precision, recall };
};
