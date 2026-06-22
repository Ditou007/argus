import express from "express";
import cors from "cors";
import pg from "pg";
import { Redis } from "ioredis";
import { createEventsRouter } from "./routes/events.js";
import { createHealthRouter } from "./routes/health.js";
import { createSessionsRouter } from "./routes/sessions.js";
import { createActionRouter } from "./routes/session-actions.js";
import { createUnexplainedRouter } from "./routes/unexplained.js";
import { createLiveStream } from "./ws/live-stream.js";
import { createClickHouseWriter } from "./correlation/clickhouse-writer.js";
import { createTraceStore } from "./correlation/trace-store.js";
import { createStreamingService } from "./correlation/streaming-service.js";
import { createStreamConsumer } from "./correlation/stream-consumer.js";
import { rehydrateWindows } from "./correlation/rehydrate.js";
import { config } from "./config.js";

// Wire-protocol constants for the durable correlation stream (ADR 0002).
// EVENT_STREAM_KEY MUST match ingestion's stream-publisher EVENT_STREAM_KEY.
const EVENT_STREAM_KEY = "argus:events:stream";
const STREAM_GROUP = "argus-correlator";

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const app = express();
const pool = new pg.Pool(config.database);

app.use(cors());
app.use(express.json());

const server = app.listen(config.port, () => {
  console.log(`Argus API running on port ${config.port}`);
});

// Initialize WebSocket live stream
const liveStream = createLiveStream(server, pool, { redis: config.redis });

// SPEC_04: streaming correlator — consume the durable event stream, attribute to
// open action windows, and persist correlated traces to ClickHouse (ADR 0002).
const traceStore = createTraceStore(createClickHouseWriter(config.clickhouse));
const streaming = createStreamingService({ traceStore });
const streamRedis = new Redis(config.redis);
streamRedis.on("error", (err: Error) => console.error("Stream consumer redis error:", err.message));
// ioredis' xgroup/xreadgroup overloads don't fit the loose ConsumerRedis contract;
// route them through `call` (the documented escape hatch for these commands).
const consumerRedis = {
  xgroup: (...args: (string | number)[]) => streamRedis.call("XGROUP", ...args),
  xreadgroup: (...args: (string | number)[]) => streamRedis.call("XREADGROUP", ...args),
  xack: (...args: (string | number)[]) => streamRedis.call("XACK", ...args),
};
const streamConsumer = createStreamConsumer({
  redis: consumerRedis,
  streamKey: EVENT_STREAM_KEY,
  group: STREAM_GROUP,
  consumer: process.env.HOSTNAME ?? "api-1",
  onEvent: (event) => streaming.ingest(event),
  onError: (err) => console.error("Stream consumer error:", describeError(err)),
});
traceStore
  .initialize()
  // SPEC_04 Slice 2d: rebuild open windows from Postgres before consuming, so an
  // action open across a restart still attributes post-restart events.
  .then(() => rehydrateWindows(pool, streaming))
  .then((n) => n > 0 && console.log(`Rehydrated ${n} open correlation window(s)`))
  .then(() => streamConsumer.start())
  .catch((err: unknown) => console.error("Streaming correlator failed to start:", describeError(err)));

app.use("/api/health", createHealthRouter(pool));
app.use("/api/events", createEventsRouter(pool));
app.use("/api/sessions", createSessionsRouter(pool, liveStream));
app.use("/api/sessions", createActionRouter(pool, liveStream, streaming));
app.use("/api/sessions", createUnexplainedRouter(pool));

const shutdown = async () => {
  console.log("Shutting down API...");
  streamConsumer.stop();
  await streamRedis.quit().catch(() => {/* best effort */});
  await traceStore.close().catch(() => {/* best effort */});
  await liveStream.close();
  server.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { pool };
