import { watchFile, unwatchFile, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { TetragonEvent } from "./types.js";

interface WatcherOptions {
  exportPath: string;
  onEvent: (event: TetragonEvent) => Promise<void>;
}

export const createWatcher = (options: WatcherOptions) => {
  const { exportPath, onEvent } = options;
  let running = false;
  let bytesRead = 0;
  let eventCount = 0;

  const processNewLines = async () => {
    try {
      const content = await readFile(exportPath, "utf-8");
      const newContent = content.slice(bytesRead);
      bytesRead = Buffer.byteLength(content, "utf-8");

      if (!newContent.trim()) return;

      const lines = newContent.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        if (!running) break;
        try {
          const event: TetragonEvent = JSON.parse(line);
          await onEvent(event);
          eventCount++;
        } catch {
          // Skip malformed lines
        }
      }

      if (lines.length > 0) {
        console.log(`📥 Processed ${lines.length} events (${eventCount} total)`);
      }
    } catch (err) {
      console.error("Error reading Tetragon export:", err);
    }
  };

  const startPolling = () => {
    watchFile(exportPath, { interval: 1000 }, () => {
      if (running) processNewLines();
    });
  };

  const watch = () => {
    if (!existsSync(exportPath)) {
      console.warn(`⏳ Waiting for Tetragon export file: ${exportPath}`);
      const interval = setInterval(() => {
        if (existsSync(exportPath)) {
          clearInterval(interval);
          processNewLines();
          startPolling();
        }
      }, 2000);
      return;
    }

    console.log(`📡 Tailing Tetragon export: ${exportPath}`);
    processNewLines();
    startPolling();
  };

  const start = (startFromEnd = false) => {
    running = true;

    if (startFromEnd && existsSync(exportPath)) {
      bytesRead = statSync(exportPath).size;
      console.log(`📡 Skipping ${bytesRead} bytes of existing events`);
    }

    watch();
  };

  const stop = () => {
    running = false;
    unwatchFile(exportPath);
    console.log(`⏹️  Watcher stopped. Processed ${eventCount} events total.`);
  };

  return { start, stop };
};
