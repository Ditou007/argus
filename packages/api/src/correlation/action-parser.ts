import type { ActionHints } from "./types.js";

// Map action types to expected kernel functions
const ACTION_FUNCTION_MAP: Record<string, string[]> = {
  network_request: ["tcp_connect", "tcp_sendmsg"],
  llm_call: ["tcp_connect", "tcp_sendmsg"],
  file_read: ["fd_install"],
  file_write: ["fd_install", "sys_write"],
  tool_use: ["fd_install"],
};

const URL_REGEX = /https?:\/\/([^/\s:]+)(?::(\d+))?/gi;
const FILE_PATH_REGEX = /(?:^|\s)(\/[a-zA-Z0-9_./\-]+)/g;

// Noise paths we never care about matching
const NOISE_PATH_PREFIXES = [
  "/proc/self/",
  "/proc/thread-self/",
  "/dev/null",
  "/dev/urandom",
  "/usr/lib/python",
  "/usr/local/lib/python",
  "__pycache__",
];

export const parseActionHints = (action: {
  action_type: string;
  action_name: string | null;
  input_summary: string | null;
  agent_pid: number;
  pod_name: string | null;
}): ActionHints => {
  const hostnames: string[] = [];
  const ports: number[] = [];
  const filePaths: string[] = [];
  const input = action.input_summary ?? "";

  // Extract URLs -> hostnames + ports
  for (const match of input.matchAll(URL_REGEX)) {
    const hostname = match[1];
    if (hostname && !hostname.includes("localhost") && !hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      hostnames.push(hostname);
    }
    const port = match[2] ? parseInt(match[2], 10) : (match[0].startsWith("https") ? 443 : 80);
    ports.push(port);
  }

  // If no explicit URLs but action is network/llm, add default HTTPS port
  if (hostnames.length === 0 && (action.action_type === "network_request" || action.action_type === "llm_call")) {
    ports.push(443);
  }

  // Extract file paths
  for (const match of input.matchAll(FILE_PATH_REGEX)) {
    const path = match[1];
    const isNoise = NOISE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix) || path.includes(prefix));
    if (!isNoise) {
      filePaths.push(path);
    }
  }

  return {
    action_type: action.action_type,
    action_name: action.action_name,
    expected_hostnames: hostnames,
    expected_ips: [], // filled later by DNS resolution
    expected_ports: [...new Set(ports)],
    expected_file_paths: filePaths,
    expected_functions: ACTION_FUNCTION_MAP[action.action_type] ?? [],
    agent_pid: action.agent_pid,
    pod_name: action.pod_name,
  };
};

export const isNoisePath = (path: string): boolean =>
  NOISE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix) || path.includes(prefix));
