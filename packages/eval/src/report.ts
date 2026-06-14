import type { Metrics } from "./metrics.js";

const PERCENT = 100;
const PRECISION_DP = 1;

const pct = (ratio: number): string => `${(ratio * PERCENT).toFixed(PRECISION_DP)}%`;

/** Render attribution metrics as a deterministic, human-readable report. */
export const formatReport = (fixtureName: string, metrics: Metrics): string =>
  [
    `fixture:   ${fixtureName}`,
    `threshold: ${metrics.threshold}`,
    `precision: ${pct(metrics.precision)} (tp=${metrics.tp} fp=${metrics.fp})`,
    `recall:    ${pct(metrics.recall)} (fn=${metrics.fn})`,
  ].join("\n");
