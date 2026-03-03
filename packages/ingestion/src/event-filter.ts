import type { TetragonEvent } from "./types.js";

// Binaries we never care about — infrastructure noise
const DENY_BINARIES = new Set([
  "/usr/bin/runc",
  "/usr/local/bin/pg_isready",
  "/usr/local/bin/redis-cli",
  "/usr/bin/containerd",
  "/usr/bin/containerd-shim-runc-v2",
  "/usr/libexec/docker/docker-init",
  "/proc/self/fd/6", // runc init
]);

// Binary patterns we want to track (agent-related)
const ALLOW_BINARY_PATTERNS = [
  /python/i,
  /node/i,
  /agent/i,
];

const getProcess = (event: TetragonEvent) =>
  event.process_exec?.process ??
  event.process_exit?.process ??
  event.process_kprobe?.process ??
  null;

export const shouldIngest = (event: TetragonEvent): boolean => {
  const proc = getProcess(event);
  if (!proc) return false;

  const binary = proc.binary ?? "";

  // Always deny known infrastructure noise
  if (DENY_BINARIES.has(binary)) return false;

  // Allow if binary matches any agent pattern
  if (ALLOW_BINARY_PATTERNS.some((pattern) => pattern.test(binary))) return true;

  // Allow kprobe events (these come from our TracingPolicy which already filters)
  if (event.process_kprobe) return true;

  // Deny everything else
  return false;
};
