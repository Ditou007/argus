import { describe, it, expect } from "vitest";
import { pumpWithBackpressure, type PausableStream } from "../tetragon-grpc-watcher.js";

// A fake readable stream that honours pause(): data emitted while paused is
// queued and delivered on resume() — mirroring Node stream flow control, so the
// test can prove the pump never runs two handlers concurrently.
const fakeStream = () => {
  let paused = false;
  let handler: ((d: unknown) => void) | null = null;
  const queue: unknown[] = [];
  const calls = { pause: 0, resume: 0 };
  const deliver = (d: unknown) => handler?.(d);
  const stream: PausableStream = {
    on: (_e, cb) => { handler = cb; },
    pause: () => { paused = true; calls.pause++; },
    resume: () => {
      calls.resume++;
      paused = false;
      while (!paused && queue.length) deliver(queue.shift());
    },
  };
  const emit = (d: unknown) => (paused ? queue.push(d) : deliver(d));
  return { stream, emit, calls, queueLen: () => queue.length };
};

describe("pumpWithBackpressure", () => {
  it("never runs two handlers concurrently — pauses until each settles", async () => {
    const f = fakeStream();
    let inFlight = 0;
    let maxInFlight = 0;
    const gates: Array<() => void> = [];
    const handle = (_d: unknown) =>
      new Promise<void>((resolve) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        gates.push(() => { inFlight--; resolve(); });
      });

    pumpWithBackpressure(f.stream, handle, () => true);

    f.emit(1); // delivered → pause → handler 1 in flight
    f.emit(2); // stream is paused → queued, NOT processed (backpressure)
    f.emit(3);
    expect(maxInFlight).toBe(1);
    expect(f.queueLen()).toBe(2);

    gates[0](); // finish handler 1 → resume → deliver 2 → pause again
    await Promise.resolve(); await Promise.resolve();
    expect(maxInFlight).toBe(1); // still only one at a time

    gates[1]?.();
    await Promise.resolve(); await Promise.resolve();
    gates[2]?.();
    await Promise.resolve(); await Promise.resolve();
    expect(maxInFlight).toBe(1);
  });

  it("resumes the stream after a handler settles", async () => {
    const f = fakeStream();
    let release: () => void = () => {};
    pumpWithBackpressure(f.stream, () => new Promise<void>((r) => { release = r; }), () => true);
    f.emit(1);
    expect(f.calls.pause).toBe(1);
    expect(f.calls.resume).toBe(0); // not yet — handler still running
    release();
    await Promise.resolve(); await Promise.resolve();
    expect(f.calls.resume).toBe(1);
  });

  it("ignores events and does not resume when the watcher has stopped", async () => {
    const f = fakeStream();
    let handled = 0;
    pumpWithBackpressure(f.stream, async () => { handled++; }, () => false);
    f.emit(1);
    await Promise.resolve();
    expect(handled).toBe(0);
    expect(f.calls.pause).toBe(0);
  });
});
