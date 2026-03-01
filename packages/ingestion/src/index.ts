import { TetragonWatcher } from "./tetragon-watcher.js";
import { EventStore } from "./event-store.js";
import { config } from "./config.js";

async function main() {
  console.log("🔍 Argus Ingestion Service starting...");

  const store = new EventStore(config.database);
  await store.initialize();

  const watcher = new TetragonWatcher({
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
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
