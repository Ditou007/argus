import { createWatcher } from "./tetragon-watcher.js";
import { createGrpcWatcher } from "./tetragon-grpc-watcher.js";
import { createEventStore } from "./event-store.js";
import { createClickHouseStore } from "./clickhouse-store.js";
import { createClickHouseClient } from "./clickhouse-client.js";
import { createIngestHandler } from "./ingest-handler.js";
import { shouldIngest } from "./event-filter.js";
import { config } from "./config.js";

let ingested = 0;
let filtered = 0;

const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const main = async () => {
  console.log(`Argus Ingestion Service starting (mode: ${config.tetragon.mode})...`);

  const store = createEventStore(config.database, config.redis);
  await store.initialize();

  // SPEC_04 Slice 1: dual-write the raw firehose to ClickHouse alongside
  // Postgres. ClickHouse is additive here — a ClickHouse fault (at boot OR
  // per-event) must never break the existing Postgres ingestion path. The DDL
  // init is best-effort; the store re-runs it lazily so dual-write self-heals
  // if ClickHouse was unreachable at startup.
  const clickhouse = createClickHouseStore(createClickHouseClient(config.clickhouse));
  await clickhouse.initialize().catch((err: unknown) => {
    console.error("ClickHouse init failed (continuing without ClickHouse):", describeError(err));
  });

  const handle = createIngestHandler({
    primary: store,
    mirror: clickhouse,
    shouldIngest,
    onMirrorError: (err) => {
      console.error("ClickHouse insert failed:", describeError(err));
    },
  });

  const onEvent = async (event: Parameters<typeof shouldIngest>[0]) => {
    const { ingested: wasIngested } = await handle(event);
    if (wasIngested) {
      ingested++;
    } else {
      filtered++;
    }

    if ((ingested + filtered) % 100 === 0) {
      console.log(`Ingested: ${ingested} | Filtered: ${filtered}`);
    }
  };

  // Choose watcher based on mode
  const watcher =
    config.tetragon.mode === "grpc"
      ? createGrpcWatcher({
          grpcAddress: config.tetragon.grpcAddress,
          onEvent,
        })
      : createWatcher({
          exportPath: config.tetragon.exportPath,
          onEvent,
        });

  watcher.start();

  const modeInfo =
    config.tetragon.mode === "grpc"
      ? `gRPC: ${config.tetragon.grpcAddress}`
      : `File: ${config.tetragon.exportPath}`;

  console.log(`Ingestion service running (${modeInfo})`);

  const shutdown = async () => {
    console.log("Shutting down ingestion...");
    watcher.stop();
    await store.close();
    await clickhouse.close().catch((err: unknown) => {
      console.error("ClickHouse close failed:", describeError(err));
    });
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
