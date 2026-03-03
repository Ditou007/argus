import { createWatcher } from "./tetragon-watcher.js";
import { createEventStore } from "./event-store.js";
import { shouldIngest } from "./event-filter.js";
import { config } from "./config.js";

let ingested = 0;
let filtered = 0;

const main = async () => {
  console.log("🔍 Argus Ingestion Service starting...");

  const store = createEventStore(config.database);
  await store.initialize();

  const watcher = createWatcher({
    exportPath: config.tetragon.exportPath,
    onEvent: async (event) => {
      if (shouldIngest(event)) {
        await store.insert(event);
        ingested++;
      } else {
        filtered++;
      }

      if ((ingested + filtered) % 100 === 0) {
        console.log(`📊 Ingested: ${ingested} | Filtered out: ${filtered}`);
      }
    },
  });

  watcher.start();

  console.log(`✅ Ingestion service running`);
  console.log(`   Watching: ${config.tetragon.exportPath}`);

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    watcher.stop();
    await store.close();
    process.exit(0);
  });
};

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
