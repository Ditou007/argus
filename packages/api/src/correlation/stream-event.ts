import type { StreamEvent } from "./streaming-correlator.js";

const asString = (v: unknown): string | null => (typeof v === "string" ? v : null);

const asNumber = (v: unknown, fallback: number): number => (typeof v === "number" ? v : fallback);

const parseDate = (v: unknown): Date | null => {
  const s = asString(v);
  return s ? new Date(s) : null;
};

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;

/**
 * Parse a durable-stream payload (the JSON `data` field XADD'd by ingestion)
 * into a StreamEvent. Returns null on malformed input or a missing numeric id
 * (without an id the event can't be deduped or attributed).
 * @function parseStreamEvent
 * @param data - the JSON string from the stream entry's `data` field
 * @returns the parsed StreamEvent, or null if unusable
 */
export const parseStreamEvent = (data: string): StreamEvent | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  const p = asRecord(parsed);
  if (!p || typeof p.id !== "number") return null;

  const eventTime = parseDate(p.event_time);
  return {
    id: p.id,
    event_type: asString(p.event_type) ?? "unknown",
    process_pid: asNumber(p.process_pid, 0),
    process_binary: asString(p.process_binary),
    function_name: asString(p.function_name),
    event_time: eventTime,
    created_at: parseDate(p.created_at) ?? eventTime ?? new Date(0),
    raw_event: asRecord(p.raw_event) ?? {},
    pod_name: asString(p.pod_name),
  };
};
