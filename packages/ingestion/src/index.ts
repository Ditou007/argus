import { createWatcher } from "./tetragon-watcher.js";
import { createGrpcWatcher } from "./tetragon-grpc-watcher.js";
import { createEventStore } from "./event-store.js";
import { shouldIngest } from "./event-filter.js";
import { config } from "./config.js";

let ingested = 0;
let filtered = 0;

const main = async () => {
  console.log(`Argus Ingestion Service starting (mode: ${config.tetragon.mode})...`);

  const store = createEventStore(config.database);
  await store.initialize();

  const onEvent = async (event: Parameters<typeof shouldIngest>[0]) => {
    if (shouldIngest(event)) {
      await store.insert(event);
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
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
