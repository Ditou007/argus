import { describe, it, expect } from "vitest";
import { createWatcher, type WatcherIO } from "../tetragon-watcher.js";
import type { TetragonEvent } from "../types.js";

// A fake file backed by a mutable Buffer. Records every readSlice(start,length)
// so tests can assert the watcher reads only NEW bytes, never the whole file.
const fakeFile = (initial = "") => {
  let buf = Buffer.from(initial, "utf-8");
  const reads: Array<{ start: number; length: number }> = [];
  const io: WatcherIO = {
    exists: () => true,
    size: () => buf.length,
    readSlice: (_p, start, length) => {
      reads.push({ start, length });
      return buf.subarray(start, start + length);
    },
  };
  return {
    io,
    reads,
    append: (s: string) => { buf = Buffer.concat([buf, Buffer.from(s, "utf-8")]); },
    rotate: (s = "") => { buf = Buffer.from(s, "utf-8"); }, // shrink/replace = rotation
  };
};

const line = (pid: number) => JSON.stringify({ process_kprobe: { process: { pid } }, node_name: "n", time: "t" }) + "\n";

describe("tetragon-watcher — bounded tailing", () => {
  it("emits each complete line exactly once", async () => {
    const f = fakeFile(line(1) + line(2));
    const seen: number[] = [];
    const w = createWatcher({
      exportPath: "/x", startFromEnd: false, io: f.io,
      onEvent: async (e: TetragonEvent) => { seen.push(e.process_kprobe!.process.pid); },
    });
    await w.poll();
    expect(seen).toEqual([1, 2]);
  });

  it("reads ONLY new bytes on each pass — never re-reads the whole file (the OOM bug)", async () => {
    const f = fakeFile(line(1));
    const w = createWatcher({ exportPath: "/x", startFromEnd: false, io: f.io, onEvent: async () => {} });
    await w.poll();
    const firstStart = f.reads[0].start;
    f.append(line(2) + line(3));
    await w.poll();
    // Second read must start AFTER the first chunk, not at 0 (no whole-file re-read).
    const secondRead = f.reads[f.reads.length - 1];
    expect(firstStart).toBe(0);
    expect(secondRead.start).toBeGreaterThan(0);
    expect(secondRead.length).toBe(Buffer.byteLength(line(2) + line(3), "utf-8"));
  });

  it("does not re-emit already-consumed lines when polled with no new data", async () => {
    const f = fakeFile(line(1));
    let count = 0;
    const w = createWatcher({ exportPath: "/x", startFromEnd: false, io: f.io, onEvent: async () => { count++; } });
    await w.poll();
    await w.poll();
    await w.poll();
    expect(count).toBe(1);
  });

  it("reentrancy guard: overlapping polls never run concurrently (prevents pile-up)", async () => {
    const f = fakeFile(line(1));
    let inFlight = 0;
    let maxInFlight = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const w = createWatcher({
      exportPath: "/x", startFromEnd: false, io: f.io,
      onEvent: async () => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await gate; inFlight--; },
    });
    const p1 = w.poll();          // enters, blocks on gate
    const p2 = w.poll();          // must no-op (guard), not start a second concurrent pass
    await p2;                     // returns immediately
    f.append(line(2));            // new data the second (skipped) pass would have read
    release();
    await p1;
    expect(maxInFlight).toBe(1);  // never two passes at once
  });

  it("holds back a partial trailing line until its newline arrives", async () => {
    const l2 = line(2);
    const cut = 15; // split a real line mid-way (no trailing newline yet)
    const f = fakeFile(line(1) + l2.slice(0, cut));
    const seen: number[] = [];
    const w = createWatcher({
      exportPath: "/x", startFromEnd: false, io: f.io,
      onEvent: async (e: TetragonEvent) => { seen.push(e.process_kprobe!.process.pid); },
    });
    await w.poll();
    expect(seen).toEqual([1]); // partial line 2 not yet emitted (no newline)
    f.append(l2.slice(cut)); // delivers the rest incl. the newline
    await w.poll();
    expect(seen).toEqual([1, 2]);
  });

  it("resets the offset when the file shrinks (rotation/truncation)", async () => {
    const f = fakeFile(line(1) + line(2));
    const seen: number[] = [];
    const w = createWatcher({
      exportPath: "/x", startFromEnd: false, io: f.io,
      onEvent: async (e: TetragonEvent) => { seen.push(e.process_kprobe!.process.pid); },
    });
    await w.poll();
    f.rotate(line(3)); // smaller file → rotation; offset must reset to 0
    await w.poll();
    expect(seen).toEqual([1, 2, 3]);
  });

  it("skips malformed JSON without throwing or stalling the tail", async () => {
    const f = fakeFile("not json\n" + line(5));
    const seen: number[] = [];
    const w = createWatcher({
      exportPath: "/x", startFromEnd: false, io: f.io,
      onEvent: async (e: TetragonEvent) => { seen.push(e.process_kprobe!.process.pid); },
    });
    await w.poll();
    expect(seen).toEqual([5]);
  });

  it("startFromEnd seeds the offset to EOF so history is not reprocessed on restart", async () => {
    const f = fakeFile(line(1) + line(2)); // pre-existing history
    const seen: number[] = [];
    const w = createWatcher({
      exportPath: "/x", startFromEnd: true, io: f.io,
      onEvent: async (e: TetragonEvent) => { seen.push(e.process_kprobe!.process.pid); },
    });
    w.start();
    await w.poll();
    expect(seen).toEqual([]); // nothing replayed
    f.append(line(3));
    await w.poll();
    expect(seen).toEqual([3]); // only new events after restart
    w.stop();
  });
});
