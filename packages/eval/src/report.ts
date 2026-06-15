import type { Metrics } from "./metrics.js";
import type { TypeMetrics } from "./corpus-metrics.js";
import type { CalibrationBin } from "./calibration.js";
import type { UnexplainedMetrics } from "./unexplained-metrics.js";

const PERCENT = 100;
const PRECISION_DP = 1;
const TYPE_COL = 16;
const BAND_DP = 1;
const COUNT_COL = 5;
const OBSERVED_COL = 8;
const EMPTY_BIN = "—"; // an empty band has no observed accuracy — never a misleading 0.0%

const pct = (ratio: number): string => `${(ratio * PERCENT).toFixed(PRECISION_DP)}%`;
const pad3 = (ratio: number): string => `${(ratio * PERCENT).toFixed(0)}%`.padStart(4);

/** Render attribution metrics as a deterministic, human-readable report. */
export const formatReport = (fixtureName: string, metrics: Metrics): string =>
  [
    `fixture:   ${fixtureName}`,
    `threshold: ${metrics.threshold}`,
    `precision: ${pct(metrics.precision)} (tp=${metrics.tp} fp=${metrics.fp})`,
    `recall:    ${pct(metrics.recall)} (fn=${metrics.fn})`,
  ].join("\n");

/** Render per-action-type metrics as a deterministic table. */
export const formatCorpusReport = (threshold: number, byType: readonly TypeMetrics[]): string => {
  const header = `${"action_type".padEnd(TYPE_COL)}  prec  recall   f1   (tp/fp/fn)`;
  const rows = byType.map(
    (m) =>
      `${m.action_type.padEnd(TYPE_COL)}  ${pad3(m.precision)}  ${pad3(m.recall)}  ${m.f1.toFixed(2)}  ` +
      `(${m.tp}/${m.fp}/${m.fn})`
  );
  return [`corpus metrics @ threshold ${threshold}`, header, ...rows].join("\n");
};

/** Render the confidence-calibration curve as a deterministic table. */
export const formatCalibrationReport = (bins: readonly CalibrationBin[]): string => {
  const header = `band     ${"count".padStart(COUNT_COL)}  ${"observed".padStart(OBSERVED_COL)}`;
  const rows = bins.map((b) => {
    const band = `${b.lower.toFixed(BAND_DP)}-${b.upper.toFixed(BAND_DP)}`;
    const observed = b.count === 0 ? EMPTY_BIN.padStart(OBSERVED_COL) : pct(b.accuracy).padStart(OBSERVED_COL);
    return `${band}  ${String(b.count).padStart(COUNT_COL)}  ${observed}`;
  });
  return ["calibration (emitted correlations, uncertain excluded)", header, ...rows].join("\n");
};

/** Render unexplained-behaviour detection metrics deterministically. */
export const formatUnexplainedReport = (m: UnexplainedMetrics): string =>
  [
    `unexplained-behaviour detection @ threshold ${m.threshold}`,
    `precision: ${pct(m.precision)} (tp=${m.tp} fp=${m.fp})`,
    `recall:    ${pct(m.recall)} (fn=${m.fn})`,
  ].join("\n");
