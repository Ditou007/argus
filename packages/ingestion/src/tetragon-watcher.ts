import { createReadStream, watchFile, unwatchFile, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import type { TetragonEvent } from "./types.js";

interface WatcherOptions {
  exportPath: string;
  onEvent: (event: TetragonEvent) => Promise<void>;
}

/**
 * Watches the Tetragon JSON export file for new events.
 * Tetragon writes one JSON event per line to its export file.
 */
export class TetragonWatcher {
  private exportPath: string;
  private onEvent: (event: TetragonEvent) => Promise<void>;
  private running = false;

  constructor(options: WatcherOptions) {
    this.exportPath = options.exportPath;
    this.onEvent = options.onEvent;
  }

  start() {
    this.running = true;
    this.watch();
  }

  stop() {
    this.running = false;
    unwatchFile(this.exportPath);
  }

  private watch() {
    if (!existsSync(this.exportPath)) {
      console.warn(`⏳ Waiting for Tetragon export file: ${this.exportPath}`);
      // Poll until the file appears
      const interval = setInterval(() => {
        if (existsSync(this.exportPath)) {
          clearInterval(interval);
          this.tailFile();
        }
      }, 2000);
      return;
    }

    this.tailFile();
  }

  private tailFile() {
    console.log(`📡 Tailing Tetragon export: ${this.exportPath}`);

    const stream = createReadStream(this.exportPath, {
      encoding: "utf-8",
      // Start from end of file (only new events)
    });

    const rl = createInterface({ input: stream });

    rl.on("line", async (line) => {
      if (!this.running || !line.trim()) return;

      try {
        const event: TetragonEvent = JSON.parse(line);
        await this.onEvent(event);
      } catch (err) {
        console.error("Failed to parse Tetragon event:", err);
      }
    });

    // Watch for file changes (new events appended)
    watchFile(this.exportPath, { interval: 500 }, () => {
      // File changed — readline will pick up new lines
    });
  }
}
