import type { SignalMatcher } from "../types.js";
import type { CorrelationConfig } from "../config.js";
import { isNoisePath } from "../action-parser.js";
import { normalizeSyscall } from "../syscall.js";

const FILE_FUNCTIONS = new Set(["fd_install", "sys_write", "sys_read"]);

/** File-path only applies to file actions. */
const isFileAction = (actionType: string): boolean =>
  actionType === "file_read" || actionType === "file_write";

/** Either path is a prefix of the other (expected /data/ vs event /data/report.pdf). */
const isPrefixMatch = (eventPath: string, expectedPaths: readonly string[]): boolean =>
  expectedPaths.some((expected) => eventPath.startsWith(expected) || expected.startsWith(eventPath));

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

/** Score an extracted event path against the action's expected paths. */
const scoreExtractedPath = (
  eventPath: string,
  expectedPaths: readonly string[]
): { score: number; reason: string } => {
  if (isNoisePath(eventPath)) return { score: 0.05, reason: `noise path: ${eventPath}` };
  if (expectedPaths.length === 0) {
    return { score: 0.5, reason: `file operation on ${eventPath} (no expected paths to compare)` };
  }
  if (expectedPaths.includes(eventPath)) return { score: 1.0, reason: `exact path match: ${eventPath}` };
  if (isPrefixMatch(eventPath, expectedPaths)) return { score: 0.7, reason: `path prefix match: ${eventPath}` };
  return { score: 0.1, reason: `unrelated path: ${eventPath}` };
};

/**
 * File-path signal: does the event's file path match the action's expected paths?
 * @function filePath
 * @param config - Engine config supplying the file_path weight.
 */
export const filePath = (config: CorrelationConfig): SignalMatcher => (event, _action, hints) => {
  const weight = config.weights.file_path;

  // If the action is not file-related, opt out
  if (!isFileAction(hints.action_type)) {
    return { signal_name: "file_path", score: 0, weight: 0, reason: "not a file action" };
  }

  // If this event is not a file function, low score (arch-normalized so
  // __arm64_sys_write / __x64_sys_write match the bare sys_write set)
  if (!FILE_FUNCTIONS.has(normalizeSyscall(event.function_name))) {
    return { signal_name: "file_path", score: 0, weight, reason: `${event.function_name} is not a file syscall` };
  }

  const eventPath = extractFilePath(event.raw_event);
  if (!eventPath) {
    return { signal_name: "file_path", score: 0.2, weight, reason: "file function but no path extracted" };
  }

  const { score, reason } = scoreExtractedPath(eventPath, hints.expected_file_paths);
  return { signal_name: "file_path", score, weight, reason };
};
