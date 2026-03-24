import type { SignalMatcher } from "../types.js";
import { isNoisePath } from "../action-parser.js";

const WEIGHT = 0.20;
const FILE_FUNCTIONS = new Set(["fd_install", "sys_write", "sys_read"]);

// Extract file path from raw kprobe event args
const extractFilePath = (raw: Record<string, unknown>): string | null => {
  const kprobe =
    (raw.process_kprobe as Record<string, unknown>) ??
    (raw.processKprobe as Record<string, unknown>);
  if (!kprobe) return null;

  const args = kprobe.args as Array<Record<string, unknown>> | undefined;
  if (!args) return null;

  for (const arg of args) {
    const fileArg = (arg.fileArg ?? arg.file_arg) as Record<string, unknown> | undefined;
    if (fileArg && fileArg.path) return String(fileArg.path);
  }

  return null;
};

export const filePath: SignalMatcher = (event, _action, hints) => {
  const isFileAction = hints.action_type === "file_read" || hints.action_type === "file_write";

  // If the action is not file-related, opt out
  if (!isFileAction) {
    return { signal_name: "file_path", score: 0, weight: 0, reason: "not a file action" };
  }

  // If this event is not a file function, low score
  if (!FILE_FUNCTIONS.has(event.function_name ?? "")) {
    return {
      signal_name: "file_path",
      score: 0,
      weight: WEIGHT,
      reason: `${event.function_name} is not a file syscall`,
    };
  }

  const eventPath = extractFilePath(event.raw_event);

  // No file path extractable
  if (!eventPath) {
    return {
      signal_name: "file_path",
      score: 0.2,
      weight: WEIGHT,
      reason: "file function but no path extracted",
    };
  }

  // Filter noise paths (Python internals, /proc/self, etc.)
  if (isNoisePath(eventPath)) {
    return {
      signal_name: "file_path",
      score: 0.05,
      weight: WEIGHT,
      reason: `noise path: ${eventPath}`,
    };
  }

  // No expected paths to compare (agent didn't report specific files)
  if (hints.expected_file_paths.length === 0) {
    return {
      signal_name: "file_path",
      score: 0.5,
      weight: WEIGHT,
      reason: `file operation on ${eventPath} (no expected paths to compare)`,
    };
  }

  // Exact match
  if (hints.expected_file_paths.includes(eventPath)) {
    return {
      signal_name: "file_path",
      score: 1.0,
      weight: WEIGHT,
      reason: `exact path match: ${eventPath}`,
    };
  }

  // Prefix match (e.g., expected /data/, event /data/report.pdf)
  const prefixMatch = hints.expected_file_paths.some(
    (expected) => eventPath.startsWith(expected) || expected.startsWith(eventPath)
  );
  if (prefixMatch) {
    return {
      signal_name: "file_path",
      score: 0.7,
      weight: WEIGHT,
      reason: `path prefix match: ${eventPath}`,
    };
  }

  return {
    signal_name: "file_path",
    score: 0.1,
    weight: WEIGHT,
    reason: `unrelated path: ${eventPath}`,
  };
};
