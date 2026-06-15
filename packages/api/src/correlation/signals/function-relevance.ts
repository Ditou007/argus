import type { SignalMatcher, SignalResult } from "../types.js";
import type { CorrelationConfig } from "../config.js";
import { normalizeSyscall } from "../syscall.js";

const PROCESS_LIFECYCLE = new Set(["process_exec", "process_exit"]);
const NETWORK_FUNCTIONS = new Set(["tcp_connect", "tcp_sendmsg"]);

const SCORE_EXPECTED = 1.0; // the kprobe function is exactly what the action expects
const SCORE_TOOL_USE = 1.0; // exec/exit during a tool_use action
const SCORE_FD_INSTALL = 0.4; // generic file-descriptor allocation
const SCORE_LIFECYCLE = 0.3; // exec/exit unrelated to a tool_use action
const SCORE_NEUTRAL = 0.3; // no signal either way
const SCORE_MISPLACED_WRITE = 0.2; // a write syscall during a non-write action
const SCORE_MISPLACED_NET = 0.1; // a network syscall during a non-network action

/** Exec/exit are strong evidence for tool_use, mild lifecycle noise otherwise. */
const scoreProcessLifecycle = (
  eventType: string,
  actionType: string
): { score: number; reason: string } | null => {
  if (!PROCESS_LIFECYCLE.has(eventType)) return null;
  if (actionType === "tool_use") return { score: SCORE_TOOL_USE, reason: `${eventType} matches tool_use action` };
  return { score: SCORE_LIFECYCLE, reason: `${eventType} is general process lifecycle` };
};

/** A network syscall fired during an action that doesn't talk to the network. */
const isMisplacedNetworkFn = (fn: string, actionType: string): boolean =>
  NETWORK_FUNCTIONS.has(fn) && actionType !== "network_request" && actionType !== "llm_call";

/** A write syscall fired during a non-write action. */
const isMisplacedWrite = (fn: string, actionType: string): boolean =>
  fn === "sys_write" && actionType !== "file_write";

/** Function-relevance signal: does the event's syscall fit the reported action? */
export const functionRelevance = (config: CorrelationConfig): SignalMatcher => (event, _action, hints) => {
  const weight = config.weights.function_relevance;
  const fn = event.function_name ?? ""; // raw symbol, kept for the human-readable reason
  const norm = normalizeSyscall(fn); // arch-independent core used for matching
  const eventType = event.event_type;
  const actionType = hints.action_type;
  const result = (score: number, reason: string): SignalResult => ({
    signal_name: "function_relevance",
    score,
    weight,
    reason,
  });

  const lifecycle = scoreProcessLifecycle(eventType, actionType);
  if (lifecycle) return result(lifecycle.score, lifecycle.reason);

  if (hints.expected_functions.includes(norm)) return result(SCORE_EXPECTED, `${fn} expected for ${actionType}`);

  // fd_install is a kernel function, not a syscall wrapper — no arch variant, so compare the raw name
  if (fn === "fd_install") return result(SCORE_FD_INSTALL, "fd_install is generic (file descriptor allocation)");

  if (isMisplacedNetworkFn(norm, actionType)) return result(SCORE_MISPLACED_NET, `${fn} unlikely for ${actionType}`);

  if (isMisplacedWrite(norm, actionType)) {
    return result(SCORE_MISPLACED_WRITE, `${fn} with non-write action ${actionType}`);
  }

  return result(SCORE_NEUTRAL, `${fn || eventType} has neutral relevance to ${actionType}`);
};
