import { describe, it, expect } from "vitest";
import { buildCandidateQuery } from "../correlator.js";

// SPEC_03 Slice 2 / T2 — the candidate query is the production discriminator for
// compose-mode (pid:host) correlation. With no k8s pod metadata, an action's
// pod_name is null, so candidates are filtered by the agent's host PID — a
// syscall from a different host process is never even a candidate (it is excluded
// here, upstream of scoring). In K8s the same query keys on pod_name instead.

describe("buildCandidateQuery — compose-mode (pid:host) candidate selection", () => {
  const window = { started_at: "2026-06-19T00:00:00.000Z", ended_at: "2026-06-19T00:00:00.500Z" };

  it("keys on process_pid when the action has no pod_name (compose mode)", () => {
    const { text, values } = buildCandidateQuery({ pod_name: null, agent_pid: 48217, ...window });
    expect(text).toContain("process_pid = $1");
    expect(text).not.toContain("pod_name = $1");
    expect(values[0]).toBe(48217); // a foreign-PID event (different process_pid) cannot match
  });

  it("keys on pod_name when the action has one (K8s mode)", () => {
    const { text, values } = buildCandidateQuery({ pod_name: "agent-pod-x", agent_pid: 1, ...window });
    expect(text).toContain("pod_name = $1");
    expect(text).not.toContain("process_pid = $1");
    expect(values[0]).toBe("agent-pod-x");
  });
});
