import { capTail } from "./cap-tail.js";
import type { StoredEvent, TimelineEntry } from "./api.js";

/** The live-stream payload pushed over the WebSocket for each captured event. */
export interface LiveEventData {
  id: number;
  event_type: string;
  pod_name: string;
  process_pid: number | null;
  process_binary: string | null;
  function_name: string | null;
  event_time: string | null;
}

/**
 * Append a live (unscored) event to the most-recent action in the timeline,
 * keeping a bounded tail per action so an active session can't grow the
 * browser's state without limit. Pure (no clock/IO) — `now` is injected.
 * @function appendLiveEvent
 * @param timeline - the current timeline (returned unchanged when empty)
 * @param data - the live event payload
 * @param max - max events to retain on the last action
 * @param now - ISO timestamp fallback when the event carries no time
 * @returns a new timeline with the event appended to its last action
 */
export const appendLiveEvent = (
  timeline: readonly TimelineEntry[],
  data: LiveEventData,
  max: number,
  now: string
): TimelineEntry[] => {
  if (timeline.length === 0) return [...timeline];
  const updated = [...timeline];
  const lastIdx = updated.length - 1;
  const lastEntry = updated[lastIdx];
  const liveEvent: StoredEvent = {
    id: data.id,
    event_type: data.event_type,
    process_binary: data.process_binary,
    process_pid: data.process_pid,
    function_name: data.function_name,
    raw_event: {},
    created_at: data.event_time ?? now,
  };
  updated[lastIdx] = { ...lastEntry, events: capTail([...lastEntry.events, liveEvent], max) };
  return updated;
};
