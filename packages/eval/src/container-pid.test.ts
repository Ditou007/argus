import { describe, it, expect } from "vitest";
import { processIdentity } from "@argus/api/correlation/signals/process-identity";
import { DEFAULT_CORRELATION_CONFIG } from "@argus/api/correlation/config";
import type { EventCandidate, ActionWindow, ActionHints } from "@argus/api/correlation/types";

// Slice 11 / D12: the SDK reports the container-namespace PID (1) while Tetragon
// reports host PIDs. When agent_pid === 1 the exact-PID (1.0) and child-PID (0.7)
// paths compare a container PID against host PIDs — meaningless, and the child
// path is actively wrong (host processes reparented to init have parent pid 1).
// In that case identity must fall to the pod-level signal, not claim a match.

const window: ActionWindow = { started_at: new Date(0), ended_at: new Date(1000) };

const hints = (agent_pid: number): ActionHints => ({
  action_type: "file_read",
  action_name: null,
  expected_hostnames: [],
  expected_ips: [],
  expected_ports: [],
  expected_file_paths: [],
  expected_functions: [],
  agent_pid,
  pod_name: "real-agent-wl6xn",
});

const event = (host_pid: number, parent_pid: number | null): EventCandidate => ({
  id: 1,
  event_type: "process_exec",
  process_pid: host_pid,
  process_binary: "/app/python",
  function_name: null,
  event_time: new Date(500),
  created_at: new Date(500),
  raw_event: parent_pid === null ? {} : { process_exec: { parent: { pid: parent_pid } } },
});

const score = (e: EventCandidate, agent_pid: number) =>
  processIdentity(DEFAULT_CORRELATION_CONFIG)(e, window, hints(agent_pid));

describe("container-PID identity (D12)", () => {
  it("does not spuriously match a host process reparented to init as 'child of agent'", () => {
    // agent_pid=1 (container init), a host event whose parent is host init (pid 1)
    const result = score(event(34232, 1), 1);
    expect(result.score).toBe(0.4); // same-pod, NOT the 0.7 child-of-agent false positive
    expect(result.reason).toContain("same pod");
  });

  it("does not treat host init (pid 1) as the agent under a container PID", () => {
    const result = score(event(1, null), 1);
    expect(result.score).toBe(0.4); // not the 1.0 exact-match false positive
  });

  it("still does exact-PID matching when the agent PID is a real host PID", () => {
    const result = score(event(34232, null), 34232);
    expect(result.score).toBe(1); // exact match preserved when agent_pid is a host PID
    expect(result.reason).toContain("exact PID match");
  });

  it("still recognizes a genuine child when the agent PID is a real host PID", () => {
    const result = score(event(40000, 34232), 34232);
    expect(result.score).toBe(0.7);
    expect(result.reason).toContain("child of agent");
  });
});
