/**
 * Tunable constants for the multi-signal correlation engine, extracted from the
 * signals so accuracy work (SPEC_01) can justify or sweep them from data instead
 * of editing source. The shipped {@link DEFAULT_CORRELATION_CONFIG} reproduces
 * the original hand-tuned values byte-for-byte.
 */
export interface CorrelationConfig {
  /** Per-signal weights; the score is Σ(score·weight)/Σ(weight) over participating signals. */
  readonly weights: {
    readonly process_identity: number;
    readonly network_destination: number;
    readonly file_path: number;
    readonly time_proximity: number;
    readonly function_relevance: number;
  };
  /** A correlation whose confidence falls below this is discarded (no match). */
  readonly discardThreshold: number;
  /** Confidence bands used to classify a correlation as high / medium / low. */
  readonly bands: {
    readonly high: number; // confidence > high → high confidence
    readonly medium: number; // confidence >= medium → medium, else low
  };
  /** Time-proximity signal tuning. */
  readonly time: {
    readonly clockSkewMs: number; // tolerance for events just outside the window
    readonly minWindowMs: number; // pad applied to actions shorter than minActionMs
    readonly minActionMs: number; // an action shorter than this is treated as a point in time
    readonly gaussianCoefficient: number; // decay steepness in exp(coeff · normalized²)
  };
}

/** The original hand-tuned engine constants — changing these changes scoring. */
export const DEFAULT_CORRELATION_CONFIG: CorrelationConfig = {
  weights: {
    process_identity: 0.25,
    network_destination: 0.25,
    file_path: 0.2,
    time_proximity: 0.15,
    function_relevance: 0.15,
  },
  discardThreshold: 0.15,
  bands: { high: 0.7, medium: 0.3 },
  time: { clockSkewMs: 500, minWindowMs: 200, minActionMs: 100, gaussianCoefficient: -2 },
};
