import { parseStreamEvent } from "./stream-event.js";
import type { StreamEvent } from "./streaming-correlator.js";

const DEFAULT_BATCH = 100;
const ERROR_BACKOFF_MS = 1000;
const DEFAULT_BLOCK_MS = 5000;

/** One stream entry: its id and flat [field, value, …] array. */
export interface StreamEntry {
  readonly id: string;
  readonly fields: string[];
}

const parseEntry = (entry: unknown): StreamEntry | null => {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const [id, fields] = entry;
  if (typeof id !== "string" || !Array.isArray(fields)) return null;
  return { id, fields: fields.map(String) };
};

const parseEntries = (entries: unknown): StreamEntry[] =>
  Array.isArray(entries)
    ? entries.map(parseEntry).filter((e): e is StreamEntry => e !== null)
    : [];

/**
 * Flatten an ioredis XREADGROUP reply (`[[streamKey, [[id, [f,v,…]], …]], …]`,
 * or null on block timeout) into a flat list of stream entries.
 * @function parseStreamReply
 * @param reply - the raw XREADGROUP reply
 * @returns the entries (empty on null/malformed)
 */
export const parseStreamReply = (reply: unknown): StreamEntry[] => {
  if (!Array.isArray(reply)) return [];
  return reply.flatMap((stream) =>
    Array.isArray(stream) && stream.length >= 2 ? parseEntries(stream[1]) : []
  );
};

const extractData = (fields: string[]): string | null => {
  const i = fields.indexOf("data");
  return i >= 0 && i + 1 < fields.length ? fields[i + 1] : null;
};

/** The Redis surface the consumer drives (ioredis consumer-group commands). */
export interface ConsumerRedis {
  xgroup: (...args: (string | number)[]) => Promise<unknown>;
  xreadgroup: (...args: (string | number)[]) => Promise<unknown>;
  xack: (...args: (string | number)[]) => Promise<unknown>;
}

export interface StreamConsumerDeps {
  readonly redis: ConsumerRedis;
  readonly streamKey: string;
  readonly group: string;
  readonly consumer: string;
  readonly onEvent: (event: StreamEvent) => void;
  readonly onError: (err: unknown) => void;
  readonly batchSize?: number;
}

/**
 * Build the durable-stream consumer: a consumer-group reader (XREADGROUP) that
 * parses each entry, drives onEvent, and acks (at-least-once; ADR 0002). Poison
 * entries are acked too, to avoid redelivery storms.
 * @function createStreamConsumer
 * @param deps - redis, stream/group/consumer names, onEvent/onError, batch size
 * @returns ensureGroup, pollOnce (one batch), start (loop), stop
 */
export const createStreamConsumer = (deps: StreamConsumerDeps) => {
  const batch = deps.batchSize ?? DEFAULT_BATCH;
  let running = false;

  const ensureGroup = async (): Promise<void> => {
    try {
      await deps.redis.xgroup("CREATE", deps.streamKey, deps.group, "$", "MKSTREAM");
    } catch (err) {
      // BUSYGROUP = the group already exists — idempotent, fine.
      if (!String(err).includes("BUSYGROUP")) throw err;
    }
  };

  const pollOnce = async (blockMs: number): Promise<number> => {
    const reply = await deps.redis.xreadgroup(
      "GROUP", deps.group, deps.consumer,
      "COUNT", batch, "BLOCK", blockMs,
      "STREAMS", deps.streamKey, ">"
    );
    const entries = parseStreamReply(reply);
    const ackIds: string[] = [];
    for (const entry of entries) {
      const data = extractData(entry.fields);
      const event = data ? parseStreamEvent(data) : null;
      if (event) deps.onEvent(event);
      ackIds.push(entry.id);
    }
    if (ackIds.length > 0) {
      await deps.redis.xack(deps.streamKey, deps.group, ...ackIds);
    }
    return entries.length;
  };

  const start = async (blockMs: number = DEFAULT_BLOCK_MS): Promise<void> => {
    running = true;
    await ensureGroup();
    while (running) {
      try {
        await pollOnce(blockMs);
      } catch (err) {
        deps.onError(err);
        await new Promise((resolve) => setTimeout(resolve, ERROR_BACKOFF_MS));
      }
    }
  };

  const stop = (): void => {
    running = false;
  };

  return { ensureGroup, pollOnce, start, stop };
};
