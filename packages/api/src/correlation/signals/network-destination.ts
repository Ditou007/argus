import type { SignalMatcher } from "../types.js";

const WEIGHT = 0.25;
const NETWORK_FUNCTIONS = new Set(["tcp_connect", "tcp_sendmsg"]);

// Extract sock_arg from raw kprobe event args
const extractSockArg = (raw: Record<string, unknown>): { daddr: string; dport: number } | null => {
  const kprobe =
    (raw.process_kprobe as Record<string, unknown>) ??
    (raw.processKprobe as Record<string, unknown>);
  if (!kprobe) return null;

  const args = kprobe.args as Array<Record<string, unknown>> | undefined;
  if (!args) return null;

  for (const arg of args) {
    // gRPC camelCase or JSON snake_case
    const sock = (arg.sockArg ?? arg.sock_arg) as Record<string, unknown> | undefined;
    if (sock && sock.daddr) {
      return {
        daddr: String(sock.daddr),
        dport: Number(sock.dport ?? 0),
      };
    }
  }

  return null;
};

export const networkDestination: SignalMatcher = (event, _action, hints) => {
  const isNetworkAction = hints.action_type === "network_request" || hints.action_type === "llm_call";

  // If the action is not network-related, opt out (don't penalize)
  if (!isNetworkAction) {
    return { signal_name: "network_destination", score: 0, weight: 0, reason: "not a network action" };
  }

  // If this event is not a network function, penalize slightly
  if (!NETWORK_FUNCTIONS.has(event.function_name ?? "")) {
    return {
      signal_name: "network_destination",
      score: 0,
      weight: WEIGHT,
      reason: `${event.function_name} is not a network syscall`,
    };
  }

  const sock = extractSockArg(event.raw_event);
  if (!sock) {
    return {
      signal_name: "network_destination",
      score: 0.3,
      weight: WEIGHT,
      reason: "network function but no socket info extracted",
    };
  }

  // Check IP match
  if (hints.expected_ips.length > 0 && hints.expected_ips.includes(sock.daddr)) {
    return {
      signal_name: "network_destination",
      score: 1.0,
      weight: WEIGHT,
      reason: `IP match: ${sock.daddr}:${sock.dport}`,
    };
  }

  // Check port match only
  if (hints.expected_ports.includes(sock.dport)) {
    return {
      signal_name: "network_destination",
      score: 0.4,
      weight: WEIGHT,
      reason: `port match only: :${sock.dport} (IP ${sock.daddr} not in expected)`,
    };
  }

  return {
    signal_name: "network_destination",
    score: 0.1,
    weight: WEIGHT,
    reason: `no destination match: ${sock.daddr}:${sock.dport}`,
  };
};
