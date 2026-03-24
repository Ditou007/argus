import type { SignalMatcher, EventCandidate, ActionWindow, ActionHints, ScoredCorrelation } from "./types.js";
import { timeProximity } from "./signals/time-proximity.js";
import { processIdentity } from "./signals/process-identity.js";
import { networkDestination } from "./signals/network-destination.js";
import { filePath } from "./signals/file-path.js";
import { functionRelevance } from "./signals/function-relevance.js";

const DEFAULT_THRESHOLD = 0.15;

export const createSignalRegistry = (threshold = DEFAULT_THRESHOLD) => {
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
      signalScores[r.signal_name] = Math.round(r.score * 100) / 100;
      if (r.score > 0.3) {
        reasons.push(r.reason);
      }
    }

    return {
      event_id: event.id,
      confidence: Math.round(confidence * 1000) / 1000,
      method: bestSignal.signal_name,
      signal_scores: signalScores,
      reasons,
    };
  };

  // Register all default signals
  register(timeProximity);
  register(processIdentity);
  register(networkDestination);
  register(filePath);
  register(functionRelevance);

  return { register, scoreEvent };
};
