import type { SignalMatcher } from "../types.js";

const WEIGHT = 0.15;
const CLOCK_SKEW_MS = 500;
const MIN_WINDOW_MS = 200; // Pad short actions

export const timeProximity: SignalMatcher = (event, action) => {
  const eventTime = (event.event_time ?? event.created_at).getTime();
  const start = action.started_at.getTime();
  const end = action.ended_at.getTime();
  const duration = end - start;

  // Widen very short windows
  const padding = duration < 100 ? MIN_WINDOW_MS : 0;
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
    const score = Math.exp(-2 * normalized * normalized); // Gaussian decay
    return {
      signal_name: "time_proximity",
      score: Math.max(score, 0.5), // Floor at 0.5 if inside window
      weight: WEIGHT,
      reason: `${Math.round(distFromCenter)}ms from window center`,
    };
  }

  // Within clock skew tolerance
  const distOutside = Math.min(
    Math.abs(eventTime - windowStart),
    Math.abs(eventTime - windowEnd)
  );

  if (distOutside <= CLOCK_SKEW_MS) {
    const score = 0.3 * (1 - distOutside / CLOCK_SKEW_MS);
    return {
      signal_name: "time_proximity",
      score,
      weight: WEIGHT,
      reason: `${Math.round(distOutside)}ms outside window (clock skew tolerance)`,
    };
  }

  return {
    signal_name: "time_proximity",
    score: 0,
    weight: WEIGHT,
    reason: `${Math.round(distOutside)}ms outside window`,
  };
};
