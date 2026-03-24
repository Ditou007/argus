import type { SignalMatcher } from "../types.js";

const WEIGHT = 0.15;

export const functionRelevance: SignalMatcher = (event, _action, hints) => {
  const fn = event.function_name ?? "";
  const eventType = event.event_type;

  // process_exec/exit events are relevant for tool_use actions
  if (eventType === "process_exec" || eventType === "process_exit") {
    if (hints.action_type === "tool_use") {
      return {
        signal_name: "function_relevance",
        score: 1.0,
        weight: WEIGHT,
        reason: `${eventType} matches tool_use action`,
      };
    }
    // Exec/exit are mildly relevant for any action (process lifecycle)
    return {
      signal_name: "function_relevance",
      score: 0.3,
      weight: WEIGHT,
      reason: `${eventType} is general process lifecycle`,
    };
  }

  // Direct match: the kprobe function is in the expected list
  if (hints.expected_functions.includes(fn)) {
    return {
      signal_name: "function_relevance",
      score: 1.0,
      weight: WEIGHT,
      reason: `${fn} expected for ${hints.action_type}`,
    };
  }

  // fd_install is somewhat generic — relevant for most actions
  if (fn === "fd_install") {
    return {
      signal_name: "function_relevance",
      score: 0.4,
      weight: WEIGHT,
      reason: "fd_install is generic (file descriptor allocation)",
    };
  }

  // Network function but not a network action
  if ((fn === "tcp_connect" || fn === "tcp_sendmsg") && hints.action_type !== "network_request" && hints.action_type !== "llm_call") {
    return {
      signal_name: "function_relevance",
      score: 0.1,
      weight: WEIGHT,
      reason: `${fn} unlikely for ${hints.action_type}`,
    };
  }

  // sys_write for non-write actions
  if (fn === "sys_write" && hints.action_type !== "file_write") {
    return {
      signal_name: "function_relevance",
      score: 0.2,
      weight: WEIGHT,
      reason: `sys_write with non-write action ${hints.action_type}`,
    };
  }

  return {
    signal_name: "function_relevance",
    score: 0.3,
    weight: WEIGHT,
    reason: `${fn || eventType} has neutral relevance to ${hints.action_type}`,
  };
};
