import type { Baseline } from "./sweep.js";

/** The current metrics to check against the committed baseline. */
export interface CurrentMetrics {
  readonly attribution_f1: number;
  readonly unexplained_recall: number;
}

/** Outcome of the regression check. */
export interface GateResult {
  readonly ok: boolean;
  readonly failures: readonly string[];
}

/** Default slack allowed below baseline before a metric counts as regressed. */
export const DEFAULT_TOLERANCE = 0.05;

const DP = 3; // decimal places in the failure message

/**
 * Check current metrics against the committed baseline. A metric regresses when
 * it falls more than `tolerance` below its baseline value; each regression is
 * named so CI failure points at the offending metric.
 * @function checkRegression
 * @param current - Freshly measured metrics over the corpus.
 * @param baseline - The committed baseline metrics.
 * @param tolerance - Allowed slack below baseline (default {@link DEFAULT_TOLERANCE}).
 * @returns A {@link GateResult}; `ok` is false when any tracked metric regressed.
 */
export const checkRegression = (
  current: CurrentMetrics,
  baseline: Baseline,
  tolerance: number = DEFAULT_TOLERANCE
): GateResult => {
  const checks = [
    { name: "attribution F1", current: current.attribution_f1, baseline: baseline.attribution.f1 },
    { name: "unexplained recall", current: current.unexplained_recall, baseline: baseline.unexplained.recall },
  ];
  const failures = checks
    .filter((c) => c.current < c.baseline - tolerance)
    .map(
      (c) =>
        `${c.name} regressed: ${c.current.toFixed(DP)} < baseline ${c.baseline.toFixed(DP)} − tolerance ${tolerance.toFixed(DP)}`
    );
  return { ok: failures.length === 0, failures };
};
