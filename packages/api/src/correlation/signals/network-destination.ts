import type { SignalMatcher } from "../types.js";
import type { CorrelationConfig } from "../config.js";
import { extractSockArg } from "../resource.js";

const NETWORK_FUNCTIONS = new Set(["tcp_connect", "tcp_sendmsg"]);

/** Network-destination only applies to actions that talk to the network. */
const isNetworkAction = (actionType: string): boolean =>
  actionType === "network_request" || actionType === "llm_call";

/** Network-destination signal: does the event's socket target match the action's? */
export const networkDestination = (config: CorrelationConfig): SignalMatcher => (event, _action, hints) => {
  const weight = config.weights.network_destination;

  // If the action is not network-related, opt out (don't penalize)
  if (!isNetworkAction(hints.action_type)) {
    return { signal_name: "network_destination", score: 0, weight: 0, reason: "not a network action" };
  }

  // If this event is not a network function, penalize slightly
  if (!NETWORK_FUNCTIONS.has(event.function_name ?? "")) {
    return {
      signal_name: "network_destination",
      score: 0,
      weight,
      reason: `${event.function_name} is not a network syscall`,
    };
  }

  const sock = extractSockArg(event.raw_event);
  if (!sock) {
    return {
      signal_name: "network_destination",
      score: 0.3,
      weight,
      reason: "network function but no socket info extracted",
    };
  }

  // Check IP match
  if (hints.expected_ips.length > 0 && hints.expected_ips.includes(sock.daddr)) {
    return {
      signal_name: "network_destination",
      score: 1.0,
      weight,
      reason: `IP match: ${sock.daddr}:${sock.dport}`,
    };
  }

  // Check port match only
  if (hints.expected_ports.includes(sock.dport)) {
    return {
      signal_name: "network_destination",
      score: 0.4,
      weight,
      reason: `port match only: :${sock.dport} (IP ${sock.daddr} not in expected)`,
    };
  }

  return {
    signal_name: "network_destination",
    score: 0.1,
    weight,
    reason: `no destination match: ${sock.daddr}:${sock.dport}`,
  };
};
