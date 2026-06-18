import type { TetragonEvent } from "./types.js";

// Binaries we never care about — infrastructure noise, denied regardless of pod.
const DENY_BINARIES = new Set([
  "/usr/bin/runc",
  "/usr/local/bin/pg_isready",
  "/usr/local/bin/redis-cli",
  "/usr/bin/containerd",
  "/usr/bin/containerd-shim-runc-v2",
  "/usr/libexec/docker/docker-init",
  "/proc/self/fd/6", // runc init
]);

// Argus's own pods + datastores — exclude to prevent feedback loops
// (ingestion inserts cause tcp_sendmsg events, which get ingested, causing more inserts...).
const DENY_POD_PREFIXES = ["argus-api", "argus-ingestion", "postgres", "redis"];

// Kubernetes system namespaces — never an agent workload.
const DENY_NAMESPACES = new Set([
  "kube-system",
  "kube-public",
  "kube-node-lease",
  "local-path-storage",
]);

// Fallback binary patterns, used ONLY when an event has no pod metadata
// (docker-compose / host mode). In k8s we scope by pod instead — see shouldIngest.
const ALLOW_BINARY_PATTERNS = [/python/i, /node/i, /agent/i];

const getProcess = (event: TetragonEvent) =>
  event.process_exec?.process ??
  event.process_exit?.process ??
  event.process_kprobe?.process ??
  null;

/**
 * Decide whether a Tetragon event should be ingested.
 *
 * In Kubernetes (events carry pod metadata) we ingest **pod-scoped**: every event
 * from a tracked agent pod — regardless of binary — so a spawned tool's whole
 * process tree (`agent → sh → curl`) is captured, not just the agent's own binary.
 * Argus-own/infra pods and system namespaces are denied. When there is no pod
 * metadata (compose/host mode) we fall back to the legacy binary allowlist.
 */
export const shouldIngest = (event: TetragonEvent): boolean => {
  const proc = getProcess(event);
  if (!proc) return false;

  const binary = proc.binary ?? "";

  // Always deny known infrastructure noise.
  if (DENY_BINARIES.has(binary)) return false;

  const pod = proc.pod;
  if (pod?.name) {
    // Kubernetes: pod-scoped ingestion of the whole tracked-agent process tree.
    if (DENY_NAMESPACES.has(pod.namespace)) return false;
    if (DENY_POD_PREFIXES.some((prefix) => pod.name.startsWith(prefix))) return false;
    return true;
  }

  // No pod metadata (compose/host mode) — fall back to the legacy binary allowlist.
  if (ALLOW_BINARY_PATTERNS.some((pattern) => pattern.test(binary))) return true;
  if (event.process_kprobe) return true;
  return false;
};
