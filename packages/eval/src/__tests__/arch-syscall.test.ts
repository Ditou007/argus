import { describe, it, expect } from "vitest";
import { filePath } from "@argus/api/correlation/signals/file-path";
import { DEFAULT_CORRELATION_CONFIG } from "@argus/api/correlation/config";
import type { EventCandidate, ActionWindow, ActionHints } from "@argus/api/correlation/types";

// Slice 10 / D11: the file-path signal must recognize a write syscall as a file
// operation regardless of the kernel's architecture prefix. Before the fix,
// `__arm64_sys_write` was not in FILE_FUNCTIONS, so it scored 0 ("not a file
// syscall"); after, arm64/x64/bare all match identically.

const window: ActionWindow = { started_at: new Date(0), ended_at: new Date(1000) };

const fileWriteHints: ActionHints = {
  action_type: "file_write",
  action_name: "write report",
  expected_hostnames: [],
  expected_ips: [],
  expected_ports: [],
  expected_file_paths: [],
  expected_functions: ["fd_install", "sys_write"],
  agent_pid: 1,
  pod_name: "pod-a",
};

const writeEvent = (function_name: string): EventCandidate => ({
  id: 1,
  event_type: "kprobe",
  process_pid: 1,
  process_binary: null,
  function_name,
  event_time: new Date(500),
  created_at: new Date(500),
  raw_event: {},
});

const fileScore = (function_name: string): number =>
  filePath(DEFAULT_CORRELATION_CONFIG)(writeEvent(function_name), window, fileWriteHints).score;

describe("architecture-aware syscall matching (D11)", () => {
  it("recognizes an arm64 write as a file syscall (was 0 before the fix)", () => {
    expect(fileScore("__arm64_sys_write")).toBeGreaterThan(0);
  });

  it("scores arm64, x86-64, and bare write syscalls identically (cross-arch parity)", () => {
    const bare = fileScore("sys_write");
    expect(bare).toBeGreaterThan(0);
    expect(fileScore("__arm64_sys_write")).toBe(bare);
    expect(fileScore("__x64_sys_write")).toBe(bare);
  });

  it("still rejects a genuinely non-file syscall", () => {
    expect(fileScore("futex")).toBe(0); // not a file function → opts to score 0
  });
});
