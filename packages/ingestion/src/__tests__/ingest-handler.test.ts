import { describe, it, expect } from "vitest";
import { createIngestHandler, type EventSink } from "../ingest-handler.js";
import type { TetragonEvent } from "../types.js";

const EVENT: TetragonEvent = {
  process_kprobe: {
    process: { exec_id: "x", pid: 1, uid: 0, cwd: "/", binary: "/usr/bin/cat", start_time: "t" },
    function_name: "read",
  },
  node_name: "n",
  time: "t",
};

const recordingSink = () => {
  const writes: TetragonEvent[] = [];
  const sink: EventSink = {
    insert: async (e) => {
      writes.push(e);
    },
  };
  return { sink, writes };
};

describe("createIngestHandler", () => {
  it("skips events that should not be ingested (neither sink is written)", async () => {
    const primary = recordingSink();
    const mirror = recordingSink();
    const handler = createIngestHandler({
      primary: primary.sink,
      mirror: mirror.sink,
      shouldIngest: () => false,
      onMirrorError: () => {},
    });
    const result = await handler(EVENT);
    expect(result.ingested).toBe(false);
    expect(primary.writes).toHaveLength(0);
    expect(mirror.writes).toHaveLength(0);
  });

  it("writes the primary and mirrors to the secondary for an ingested event", async () => {
    const primary = recordingSink();
    const mirror = recordingSink();
    const handler = createIngestHandler({
      primary: primary.sink,
      mirror: mirror.sink,
      shouldIngest: () => true,
      onMirrorError: () => {},
    });
    const result = await handler(EVENT);
    expect(result.ingested).toBe(true);
    expect(primary.writes).toHaveLength(1);
    expect(mirror.writes).toHaveLength(1);
  });

  it("a mirror (ClickHouse) failure does NOT break the primary (Postgres) write — the additive invariant", async () => {
    const primary = recordingSink();
    const errors: unknown[] = [];
    const handler = createIngestHandler({
      primary: primary.sink,
      mirror: {
        insert: async () => {
          throw new Error("ClickHouse down");
        },
      },
      shouldIngest: () => true,
      onMirrorError: (err) => errors.push(err),
    });
    const result = await handler(EVENT);
    expect(result.ingested).toBe(true);
    expect(primary.writes).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it("propagates a PRIMARY (Postgres) failure — the system of record must not silently drop", async () => {
    const handler = createIngestHandler({
      primary: {
        insert: async () => {
          throw new Error("Postgres down");
        },
      },
      mirror: recordingSink().sink,
      shouldIngest: () => true,
      onMirrorError: () => {},
    });
    await expect(handler(EVENT)).rejects.toThrow("Postgres down");
  });
});
