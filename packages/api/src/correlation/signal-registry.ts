import type { SignalMatcher, EventCandidate, ActionWindow, ActionHints, ScoredCorrelation } from "./types.js";
import { DEFAULT_CORRELATION_CONFIG, type CorrelationConfig } from "./config.js";
import { timeProximity } from "./signals/time-proximity.js";
import { processIdentity } from "./signals/process-identity.js";
import { networkDestination } from "./signals/network-destination.js";
import { filePath } from "./signals/file-path.js";
import { functionRelevance } from "./signals/function-relevance.js";

const REASON_SCORE_MIN = 0.3; // only signals scoring above this contribute a reason
const SCORE_ROUNDING = 100; // signal_scores rounded to 2dp
const CONFIDENCE_ROUNDING = 1000; // confidence rounded to 3dp

/**
 * Build the multi-signal scoring registry bound to a config. `scoreEvent`
 * aggregates participating signals as Σ(score·weight)/Σ(weight) and discards
 * results below the config's threshold.
 * @function createSignalRegistry
 * @param config - Engine weights/thresholds; defaults to the shipped constants.
 */
export const createSignalRegistry = (config: CorrelationConfig = DEFAULT_CORRELATION_CONFIG) => {
  const threshold = config.discardThreshold;
  const signals: SignalMatcher[] = [];

  const register = (matcher: SignalMatcher) => {
    signals.push(matcher);
  };

  const scoreEvent = (
    event: EventCandidate,
    action: ActionWindow,
    hints: ActionHints
  ): ScoredCorrelation | null => {
    const results = signals.map((signal) => signal(event, action, hints));

    // Only signals with weight > 0 participate
    const participating = results.filter((r) => r.weight > 0);

    if (participating.length === 0) {
      return null; // No signals apply to this event
    }

    const totalWeight = participating.reduce((sum, r) => sum + r.weight, 0);
    const weightedSum = participating.reduce((sum, r) => sum + r.score * r.weight, 0);
    const confidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

    if (confidence < threshold) {
      return null; // Below threshold, discard
    }

    // Find the highest-weighted contributing signal
    const bestSignal = participating.reduce((best, r) =>
      r.score * r.weight > best.score * best.weight ? r : best
    );

    const signalScores: Record<string, number> = {};
    const reasons: string[] = [];
    for (const r of participating) {
      signalScores[r.signal_name] = Math.round(r.score * SCORE_ROUNDING) / SCORE_ROUNDING;
      if (r.score > REASON_SCORE_MIN) {
        reasons.push(r.reason);
      }
    }

    return {
      event_id: event.id,
      confidence: Math.round(confidence * CONFIDENCE_ROUNDING) / CONFIDENCE_ROUNDING,
      method: bestSignal.signal_name,
      signal_scores: signalScores,
      reasons,
    };
  };

  // Register all default signals, each bound to the active config
  register(timeProximity(config));
  register(processIdentity(config));
  register(networkDestination(config));
  register(filePath(config));
  register(functionRelevance(config));

  return { register, scoreEvent };
};
