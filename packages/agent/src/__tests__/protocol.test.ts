import { describe, it, expect } from "vitest";
import { parseToolCalls, TOOL_CALL_PREFIX } from "../protocol.js";

describe("parseToolCalls", () => {
  it("extracts a single well-formed tool call", () => {
    const text = `Sure, let me check that.\n${TOOL_CALL_PREFIX} {"tool":"read_file","args":{"path":"/etc/hostname"}}`;
    expect(parseToolCalls(text)).toEqual([{ tool: "read_file", args: { path: "/etc/hostname" } }]);
  });

  it("extracts multiple tool calls in order", () => {
    const text = [
      `${TOOL_CALL_PREFIX} {"tool":"read_file","args":{"path":"/workspace/notes.txt"}}`,
      `${TOOL_CALL_PREFIX} {"tool":"http_get","args":{"url":"https://example.com"}}`,
    ].join("\n");
    expect(parseToolCalls(text)).toEqual([
      { tool: "read_file", args: { path: "/workspace/notes.txt" } },
      { tool: "http_get", args: { url: "https://example.com" } },
    ]);
  });

  it("returns no calls for plain prose", () => {
    expect(parseToolCalls("The capital of France is Paris.")).toEqual([]);
  });

  it("skips malformed JSON without throwing", () => {
    const text = `${TOOL_CALL_PREFIX} {not valid json}\n${TOOL_CALL_PREFIX} {"tool":"run_shell","args":{"cmd":"ls"}}`;
    expect(parseToolCalls(text)).toEqual([{ tool: "run_shell", args: { cmd: "ls" } }]);
  });

  it("rejects unknown tool names", () => {
    const text = `${TOOL_CALL_PREFIX} {"tool":"delete_everything","args":{}}`;
    expect(parseToolCalls(text)).toEqual([]);
  });

  it("coerces missing args to an empty object and ignores non-string arg values", () => {
    const text = `${TOOL_CALL_PREFIX} {"tool":"run_shell"}`;
    expect(parseToolCalls(text)).toEqual([{ tool: "run_shell", args: {} }]);
  });
});
