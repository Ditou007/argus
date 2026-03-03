import { createWatcher } from "./tetragon-watcher.js";
import { createEventStore } from "./event-store.js";
import { config } from "./config.js";

const main = async () => {
  console.log("🔍 Argus Ingestion Service starting...");

  const store = createEventStore(config.database);
  await store.initialize();

  const watcher = createWatcher({
    exportPath: config.tetragon.exportPath,
    onEvent: async (event) => {
      await store.insert(event);
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
