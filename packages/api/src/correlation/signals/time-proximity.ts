import type { SignalMatcher } from "../types.js";
import type { CorrelationConfig } from "../config.js";

const INSIDE_WINDOW_FLOOR = 0.5; // minimum score for any event inside the window
const SKEW_SCORE_SCALE = 0.3; // peak score at the window edge, decaying to 0 at the skew limit

/** Time-proximity signal: closeness of the event to the action's (padded) window. */
export const timeProximity = (config: CorrelationConfig): SignalMatcher => (event, action) => {
  const weight = config.weights.time_proximity;
  const { clockSkewMs, minWindowMs, minActionMs, gaussianCoefficient } = config.time;

  const eventTime = (event.event_time ?? event.created_at).getTime();
  const start = action.started_at.getTime();
  const end = action.ended_at.getTime();
  const duration = end - start;

  // Widen very short windows
  const padding = duration < minActionMs ? minWindowMs : 0;
  const windowStart = start - padding;
  const windowEnd = end + padding;
  const windowDuration = windowEnd - windowStart;

  // Inside the (possibly padded) window
  if (eventTime >= windowStart && eventTime <= windowEnd) {
    // Gaussian-like decay from center
    const center = (windowStart + windowEnd) / 2;
    const distFromCenter = Math.abs(eventTime - center);
    const halfWindow = windowDuration / 2;
    const normalized = distFromCenter / halfWindow; // 0 at center, 1 at edge
    const score = Math.exp(gaussianCoefficient * normalized * normalized); // Gaussian decay
    return {
      signal_name: "time_proximity",
      score: Math.max(score, INSIDE_WINDOW_FLOOR), // Floor if inside window
      weight,
      reason: `${Math.round(distFromCenter)}ms from window center`,
    };
  }

  // Within clock skew tolerance
  const distOutside = Math.min(
    Math.abs(eventTime - windowStart),
    Math.abs(eventTime - windowEnd)
  );

  if (distOutside <= clockSkewMs) {
    const score = SKEW_SCORE_SCALE * (1 - distOutside / clockSkewMs);
    return {
      signal_name: "time_proximity",
      score,
      weight,
      reason: `${Math.round(distOutside)}ms outside window (clock skew tolerance)`,
    };
  }

  return {
    signal_name: "time_proximity",
    score: 0,
    weight,
    reason: `${Math.round(distOutside)}ms outside window`,
  };
};
