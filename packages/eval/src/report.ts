import type { Metrics } from "./metrics.js";
import type { TypeMetrics } from "./corpus-metrics.js";

const PERCENT = 100;
const PRECISION_DP = 1;
const TYPE_COL = 16;

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
