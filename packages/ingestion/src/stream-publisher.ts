import type { TetragonEvent } from "./types.js";
import { toEventFields } from "./event-fields.js";

/** Durable Redis Stream carrying full events to the streaming correlator (ADR 0002). */
export const EVENT_STREAM_KEY = "argus:events:stream";
/** Cap the stream length — ClickHouse is the durable record, the stream is a transport buffer. */
export const EVENT_STREAM_MAXLEN = 100_000;

/** The minimal Redis surface the publisher drives (ioredis `xadd`). */
export interface StreamRedis {
  xadd: (...args: (string | number)[]) => Promise<string | null>;
}

export interface StreamPublisher {
  publish: (event: TetragonEvent, id: number) => Promise<void>;
}

/**
 * Build the durable-stream publisher. Each call `XADD`s the full event (the
 * streaming correlator needs the raw sock/file args to score) plus the shared
 * projected fields, capped with `MAXLEN ~`.
 * @function createStreamPublisher
 * @param redis - the Redis client (ioredis `xadd`)
 * @param now - injectable clock for the created_at fallback (defaults to wall clock)
 * @returns a publisher with `publish(event, id)`
 */
export const createStreamPublisher = (
  redis: StreamRedis,
  now: () => string = () => new Date().toISOString()
): StreamPublisher => {
  const publish = async (event: TetragonEvent, id: number): Promise<void> => {
    const fields = toEventFields(event);
    const payload = {
      id,
      event_type: fields.event_type,
      process_pid: fields.process_pid ?? 0,
      process_binary: fields.process_binary,
      function_name: fields.function_name,
      pod_name: fields.pod_name,
      event_time: fields.event_time,
      created_at: fields.event_time ?? now(),
      raw_event: event,
    };
    await redis.xadd(
      EVENT_STREAM_KEY,
      "MAXLEN",
      "~",
      String(EVENT_STREAM_MAXLEN),
      "*",
      "data",
      JSON.stringify(payload)
    );
  };
  return { publish };
};
