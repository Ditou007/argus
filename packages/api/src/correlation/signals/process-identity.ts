import type { SignalMatcher } from "../types.js";

const WEIGHT = 0.25;

// Extract nested fields from raw_event safely
const getProcessPid = (raw: Record<string, unknown>, eventType: string): number | null => {
  const container =
    (raw.process_exec as Record<string, unknown>)?.process ??
    (raw.process_exit as Record<string, unknown>)?.process ??
    (raw.process_kprobe as Record<string, unknown>)?.process ??
    (raw.processExec as Record<string, unknown>)?.process ??
    (raw.processExit as Record<string, unknown>)?.process ??
    (raw.processKprobe as Record<string, unknown>)?.process;

  if (!container) return null;
  const proc = container as Record<string, unknown>;
  const pid = proc.pid;
  if (typeof pid === "number") return pid;
  if (typeof pid === "object" && pid !== null && "value" in (pid as Record<string, unknown>)) {
    return Number((pid as Record<string, unknown>).value);
  }
  return null;
};

const getParentPid = (raw: Record<string, unknown>): number | null => {
  const container =
    (raw.process_exec as Record<string, unknown>)?.parent ??
    (raw.process_exit as Record<string, unknown>)?.parent ??
    (raw.process_kprobe as Record<string, unknown>)?.parent ??
    (raw.processExec as Record<string, unknown>)?.parent ??
    (raw.processExit as Record<string, unknown>)?.parent ??
    (raw.processKprobe as Record<string, unknown>)?.parent;

  if (!container) return null;
  const proc = container as Record<string, unknown>;
  const pid = proc.pid;
  if (typeof pid === "number") return pid;
  if (typeof pid === "object" && pid !== null && "value" in (pid as Record<string, unknown>)) {
    return Number((pid as Record<string, unknown>).value);
  }
  return null;
};

export const processIdentity: SignalMatcher = (event, _action, hints) => {
  const eventPid = event.process_pid ?? getProcessPid(event.raw_event, event.event_type);
  const parentPid = getParentPid(event.raw_event);

  // Exact PID match
  if (eventPid !== null && eventPid === hints.agent_pid) {
    return {
      signal_name: "process_identity",
      score: 1.0,
      weight: WEIGHT,
      reason: `exact PID match (${eventPid})`,
    };
  }

  // Child process (parent PID matches agent)
  if (parentPid !== null && parentPid === hints.agent_pid) {
    return {
      signal_name: "process_identity",
      score: 0.7,
      weight: WEIGHT,
      reason: `child of agent (parent PID ${parentPid})`,
    };
  }

  // Same pod but different PID (weaker — pod has many processes)
  if (hints.pod_name) {
    return {
      signal_name: "process_identity",
      score: 0.4,
      weight: WEIGHT,
      reason: `same pod, different PID (event: ${eventPid}, agent: ${hints.agent_pid})`,
    };
  }

  return {
    signal_name: "process_identity",
    score: 0,
    weight: WEIGHT,
    reason: "no process relationship",
  };
};
