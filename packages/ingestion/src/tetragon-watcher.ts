import { existsSync, statSync, openSync, readSync, closeSync, watchFile, unwatchFile } from "node:fs";
import type { TetragonEvent } from "./types.js";

const NEWLINE = 0x0a; // '\n'
const DEFAULT_POLL_INTERVAL_MS = 1000;

/**
 * Minimal filesystem surface the watcher drives — injectable so the tailing
 * logic (offset math, reentrancy, rotation) is unit-testable without real I/O.
 */
export interface WatcherIO {
  exists: (path: string) => boolean;
  /** Current file size in bytes. */
  size: (path: string) => number;
  /** Read `length` bytes starting at byte `start`; returns the bytes actually read. */
  readSlice: (path: string, start: number, length: number) => Buffer;
}

const nodeIO: WatcherIO = {
  exists: existsSync,
  size: (path) => statSync(path).size,
  readSlice: (path, start, length) => {
    const fd = openSync(path, "r");
    try {
      const buf = Buffer.alloc(length);
      const bytesRead = readSync(fd, buf, 0, length, start);
      return buf.subarray(0, bytesRead);
    } finally {
      closeSync(fd);
    }
  },
};

interface WatcherOptions {
  exportPath: string;
  onEvent: (event: TetragonEvent) => Promise<void>;
  /** Poll interval for the file-change check (ms). */
  pollIntervalMs?: number;
  /**
   * Seed the offset at the current end of file so historical events are not
   * reprocessed on (re)start. Default true: ClickHouse/Postgres already hold the
   * history, so re-reading from byte 0 only duplicates rows and forces a huge
   * first pass. Set false to replay from the beginning.
   */
  startFromEnd?: boolean;
  io?: WatcherIO;
}

/**
 * Tail a Tetragon JSON-export file and emit each event.
 *
 * Bounded by construction (fixes the prior OOM): a single in-flight guard stops
 * the poll timer from launching overlapping passes; each pass reads ONLY the new
 * bytes since the last offset (never the whole growing file); the offset advances
 * only past complete newline-terminated lines (a partial trailing line is held
 * for the next pass); a shrunk file (rotation/truncation) resets the offset.
 * Events are processed sequentially with `await`, so a slow downstream applies
 * natural backpressure instead of queuing unbounded work.
 * @function createWatcher
 * @param options - export path, async onEvent sink, poll interval, startFromEnd, injectable io
 * @returns the watcher API: start, stop, and poll (one guarded pass — exposed for tests)
 */
export const createWatcher = (options: WatcherOptions) => {
  const { exportPath, onEvent } = options;
  const io = options.io ?? nodeIO;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const startFromEnd = options.startFromEnd ?? true;

  let running = false;
  let processing = false; // reentrancy guard — only one pass reads/advances at a time
  let offset = 0; // byte offset of the next unread byte
  let eventCount = 0;

  // Emit each complete line sequentially (await = backpressure); skip blanks and
  // malformed JSON so one bad line never breaks the tail.
  const emit = async (complete: Buffer): Promise<void> => {
    for (const line of complete.toString("utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        await onEvent(JSON.parse(trimmed) as TetragonEvent);
        eventCount++;
        if (eventCount % 100 === 0) console.log(`📥 Tailed ${eventCount} events`);
      } catch {
        // Skip malformed lines.
      }
    }
  };

  // One guarded pass: read only the new tail, emit complete lines, advance offset.
  const poll = async (): Promise<void> => {
    if (processing || !io.exists(exportPath)) return;
    processing = true;
    try {
      const size = io.size(exportPath);
      if (size < offset) offset = 0; // file rotated/truncated — restart from the top
      if (size <= offset) return; // nothing new

      const chunk = io.readSlice(exportPath, offset, size - offset);
      // Consume only through the last newline (bytes, multibyte-safe); the
      // trailing partial line is left for the next pass.
      const span = chunk.lastIndexOf(NEWLINE) + 1; // 0 when no complete line yet
      if (span === 0) return;
      offset += span;
      await emit(chunk.subarray(0, span));
    } catch (err) {
      console.error("Error reading Tetragon export:", err);
    } finally {
      processing = false;
    }
  };

  const start = (): void => {
    running = true;
    if (startFromEnd && io.exists(exportPath)) {
      offset = io.size(exportPath);
      console.log(`📡 Tailing Tetragon export from offset ${offset}: ${exportPath}`);
    } else {
      console.log(`📡 Tailing Tetragon export from start: ${exportPath}`);
    }
    // watchFile fires on size/mtime change; the in-flight guard makes overlapping
    // ticks safe (a slow pass simply causes later ticks to no-op until it finishes).
    watchFile(exportPath, { interval: pollIntervalMs }, () => {
      if (running) void poll();
    });
    // Kick once in case data already exists past the seeded offset.
    void poll();
  };

  const stop = (): void => {
    running = false;
    unwatchFile(exportPath);
    console.log(`⏹️  Watcher stopped. Tailed ${eventCount} events total.`);
  };

  return { start, stop, poll };
};
