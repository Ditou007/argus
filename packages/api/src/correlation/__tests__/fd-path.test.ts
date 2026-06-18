import { describe, it, expect } from "vitest";
import { resolveFdPaths, injectResolvedPath, type FdPathEvent } from "../fd-path.js";
import { extractFilePath } from "../resource.js";

const fdInstall = (id: number, pid: number, fd: number, path: string): FdPathEvent => ({
  id,
  process_pid: pid,
  function_name: "fd_install",
  raw_event: { process_kprobe: { args: [{ intArg: fd }, { fileArg: { path } }] } },
});

const write = (id: number, pid: number, fd: number, fn = "__arm64_sys_write"): FdPathEvent => ({
  id,
  process_pid: pid,
  function_name: fn,
  raw_event: { process_kprobe: { args: [{ intArg: fd }, { sizeArg: "12" }] } },
});

describe("resolveFdPaths", () => {
  it("resolves a write's fd to the path it was opened on", () => {
    const events = [fdInstall(1, 100, 3, "/tmp/.cache/.sync"), write(2, 100, 3)];
    expect(resolveFdPaths(events).get(2)).toBe("/tmp/.cache/.sync");
  });

  it("scopes fd→path per process (no cross-process bleed)", () => {
    const events = [
      fdInstall(1, 100, 3, "/proc-a/file"),
      fdInstall(2, 200, 3, "/proc-b/file"),
      write(3, 200, 3),
    ];
    expect(resolveFdPaths(events).get(3)).toBe("/proc-b/file");
  });

  it("honours fd reuse — the most recent fd_install wins", () => {
    const events = [
      fdInstall(1, 100, 3, "/first"),
      fdInstall(2, 100, 3, "/second"), // fd 3 reopened
      write(3, 100, 3),
    ];
    expect(resolveFdPaths(events).get(3)).toBe("/second");
  });

  it("leaves a write unresolved when its fd was never installed", () => {
    expect(resolveFdPaths([write(1, 100, 7)]).has(1)).toBe(false);
  });

  it("normalizes arch-prefixed write syscalls (x64/arm64)", () => {
    const events = [fdInstall(1, 100, 4, "/data/x"), write(2, 100, 4, "__x64_sys_write")];
    expect(resolveFdPaths(events).get(2)).toBe("/data/x");
  });
});

describe("injectResolvedPath", () => {
  it("makes extractFilePath find the resolved path on a write event (immutably)", () => {
    const wr = write(1, 100, 3).raw_event;
    const enriched = injectResolvedPath(wr, "/tmp/agent-workspace/checkpoint-1.json");
    expect(extractFilePath(enriched)).toBe("/tmp/agent-workspace/checkpoint-1.json");
    expect(extractFilePath(wr)).toBeNull(); // original untouched
  });
});
