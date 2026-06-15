import type { CorpusScore } from "./score-corpus.js";

/** Observed accuracy of emitted correlations whose confidence falls in one decile. */
export interface CalibrationBin {
  readonly lower: number; // inclusive band edge
  readonly upper: number; // exclusive band edge (the top bin is inclusive of 1.0)
  readonly count: number; // emitted correlations in this band
  readonly trueMatches: number; // of those, how many were true matches
  readonly accuracy: number; // trueMatches / count; 0 when the band is empty
}

const BIN_COUNT = 10;
const BIN_WIDTH = 1 / BIN_COUNT;
const ROUND_SCALE = 1000; // the engine rounds confidence to 3dp — round the same way before binning

// Round to the engine's 3dp grid before bucketing so IEEE-754 error can't push a
// boundary value (0.6 is stored just below 0.6) into the wrong decile.
const binIndex = (confidence: number): number =>
  Math.min(BIN_COUNT - 1, Math.floor(Math.round(confidence * ROUND_SCALE) / (ROUND_SCALE / BIN_COUNT)));

/**
 * Bin emitted correlations by confidence decile and report observed accuracy per
 * band — the calibration curve answering "does a 0.7 correlation come true ~70%
 * of the time?". Non-correlations (confidence 0, discarded by the engine) and
 * uncertain events are excluded so neither distorts the curve.
 * @function calibrationBins
 * @param scores - The scored (action, event) pairs from scoreCorpus.
 * @returns Exactly {@link BIN_COUNT} bins from [0.0,0.1) up to [0.9,1.0].
 */
export const calibrationBins = (scores: readonly CorpusScore[]): CalibrationBin[] => {
  const emitted = scores.filter((s) => s.confidence > 0 && !s.uncertain);
  return Array.from({ length: BIN_COUNT }, (_unused, i) => {
    const inBin = emitted.filter((s) => binIndex(s.confidence) === i);
    const trueMatches = inBin.filter((s) => s.true_match).length;
    return {
      lower: i * BIN_WIDTH,
      upper: (i + 1) * BIN_WIDTH,
      count: inBin.length,
      trueMatches,
      accuracy: inBin.length === 0 ? 0 : trueMatches / inBin.length,
    };
  });
};
