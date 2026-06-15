/** One correlation's confidence for an event, against some action. */
export interface CorrelationConfidence {
  readonly event_id: number;
  readonly confidence: number;
}

const NO_CORRELATION = 0;

/**
 * Detect unexplained behaviour: the events that no reported action accounts for.
 * An event is unexplained when its strongest correlation to *any* action is below
 * `threshold` — i.e. the agent performed a syscall it never told us about (the
 * "read /etc/passwd and never reported it" case). Attribution (the correlations)
 * must be trustworthy for this to mean anything; see SPEC_01.
 * @function detectUnexplained
 * @param eventIds - Every event observed in the session, in display order.
 * @param correlations - All (event, action) correlation confidences for the session.
 * @param threshold - The confidence at or above which an event counts as explained.
 * @returns The subset of eventIds with no correlation at or above the threshold.
 */
export const detectUnexplained = (
  eventIds: readonly number[],
  correlations: readonly CorrelationConfidence[],
  threshold: number
): number[] => {
  const bestConfidence = new Map<number, number>();
  for (const c of correlations) {
    bestConfidence.set(c.event_id, Math.max(bestConfidence.get(c.event_id) ?? NO_CORRELATION, c.confidence));
  }
  return eventIds.filter((id) => (bestConfidence.get(id) ?? NO_CORRELATION) < threshold);
};
