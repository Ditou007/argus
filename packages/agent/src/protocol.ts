/**
 * The agent's tool-call wire protocol. The LLM is instructed to emit tool calls
 * as lines prefixed with {@link TOOL_CALL_PREFIX} followed by a JSON object
 * `{ "tool": <name>, "args": { ... } }`. Parsing is pure and total: malformed
 * lines and unknown tools are dropped, never thrown.
 */

/** Line prefix the model uses to signal a tool call. */
export const TOOL_CALL_PREFIX = "TOOL_CALL:";

/** The tools the agent exposes to the model. */
export const TOOL_NAMES = ["run_shell", "read_file", "http_get"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** A single parsed tool call: a known tool name and string-valued arguments. */
export interface ToolCall {
  readonly tool: ToolName;
  readonly args: Readonly<Record<string, string>>;
}

const isToolName = (value: unknown): value is ToolName =>
  typeof value === "string" && (TOOL_NAMES as readonly string[]).includes(value);

/** Keep only string-valued args — the tools take string inputs, never structured ones. */
const coerceArgs = (raw: unknown): Record<string, string> => {
  if (typeof raw !== "object" || raw === null) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
};

const parseLine = (line: string): ToolCall | null => {
  const trimmed = line.trim();
  if (!trimmed.startsWith(TOOL_CALL_PREFIX)) return null;
  const payload = trimmed.slice(TOOL_CALL_PREFIX.length).trim();
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { tool, args } = parsed as { tool?: unknown; args?: unknown };
    if (!isToolName(tool)) return null;
    return { tool, args: coerceArgs(args) };
  } catch {
    return null;
  }
};

/** Parse all tool calls from a model response, in the order they appear. */
export const parseToolCalls = (text: string): ToolCall[] =>
  text
    .split("\n")
    .map(parseLine)
    .filter((call): call is ToolCall => call !== null);
