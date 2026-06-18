import { describe, it, expect } from "vitest";
import { shouldIngest } from "../event-filter.js";
import type { TetragonEvent, ProcessInfo } from "../types.js";

const proc = (over: Partial<ProcessInfo> = {}): ProcessInfo => ({
  exec_id: "x",
  pid: 100,
  uid: 0,
  cwd: "/app",
  binary: "/usr/local/bin/python",
  start_time: "2026-06-18T00:00:00Z",
  ...over,
});

const exec = (over: Partial<ProcessInfo> = {}): TetragonEvent => ({
  process_exec: { process: proc(over) },
  node_name: "n",
  time: "2026-06-18T00:00:00Z",
});

const kprobe = (fn: string, over: Partial<ProcessInfo> = {}): TetragonEvent => ({
  process_kprobe: { process: proc(over), function_name: fn },
  node_name: "n",
  time: "2026-06-18T00:00:00Z",
});

const AGENT_POD = { namespace: "default", name: "long-agent-abc" };

describe("shouldIngest — pod-scoped (k8s)", () => {
  it("ingests a child sh exec in a tracked agent pod (the broken-tree fix)", () => {
    expect(shouldIngest(exec({ binary: "/usr/bin/sh", pod: AGENT_POD }))).toBe(true);
  });

  it("ingests a child curl exec in a tracked agent pod", () => {
    expect(shouldIngest(exec({ binary: "/usr/bin/curl", pod: AGENT_POD }))).toBe(true);
  });

  it("ingests the agent's own python exec in a tracked agent pod", () => {
    expect(shouldIngest(exec({ binary: "/usr/local/bin/python", pod: AGENT_POD }))).toBe(true);
  });

  it("ingests a curl tcp_connect kprobe in a tracked agent pod", () => {
    expect(shouldIngest(kprobe("tcp_connect", { binary: "/usr/bin/curl", pod: AGENT_POD }))).toBe(true);
  });

  it("denies events from Argus's own pods (feedback-loop guard)", () => {
    expect(shouldIngest(exec({ binary: "/usr/bin/sh", pod: { namespace: "default", name: "argus-ingestion-xyz" } }))).toBe(false);
  });

  it("denies events from system namespaces", () => {
    expect(shouldIngest(kprobe("tcp_connect", { binary: "/usr/bin/curl", pod: { namespace: "kube-system", name: "coredns-1" } }))).toBe(false);
  });

  it("denies infra-noise binaries even in a tracked pod", () => {
    expect(shouldIngest(exec({ binary: "/usr/bin/runc", pod: AGENT_POD }))).toBe(false);
  });
});

describe("shouldIngest — no pod metadata (compose/host fallback)", () => {
  it("allows python (legacy binary allowlist)", () => {
    expect(shouldIngest(exec({ binary: "/usr/local/bin/python", pod: undefined }))).toBe(true);
  });

  it("allows any kprobe (TracingPolicy already scopes it)", () => {
    expect(shouldIngest(kprobe("tcp_connect", { binary: "/usr/bin/curl", pod: undefined }))).toBe(true);
  });

  it("denies a non-allowlisted binary's exec", () => {
    expect(shouldIngest(exec({ binary: "/usr/bin/sh", pod: undefined }))).toBe(false);
  });
});
