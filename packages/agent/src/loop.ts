import type { ToolCall } from "./protocol.js";
import { evaluateGuardrail } from "./guardrails.js";
import type { Logger } from "./logger.js";

/** A declared unit of intended work the agent reports to Argus. */
export interface DeclaredAction {
  readonly type: string;
  readonly name: string;
  readonly input: string;
}

/** One model response: natural-language text plus the structured tool calls it requested. */
export interface ModelTurn {
  readonly text: string;
  readonly toolCalls: ToolCall[];
}

/** Injected I/O the chat turn depends on — kept at the edges so the loop is pure to test. */
export interface ChatTurnDeps {
  /** Call the LLM with the user message; returns its reply text + requested tool calls. */
  readonly callLlm: (userMessage: string) => Promise<ModelTurn>;
  /** Wrap `run` in a declared Argus action (start before, end after) and return its result. */
  readonly declare: <T>(action: DeclaredAction, run: () => Promise<T>) => Promise<T>;
  /** Execute a single tool call and return its output summary. */
  readonly runTool: (call: ToolCall) => Promise<string>;
  readonly log: Logger;
  /** Action name for the llm_call (e.g. the provider/model). */
  readonly llmActionName: string;
}

/** One tool the model invoked, with the guardrail verdict and its output. */
export interface ToolRun {
  readonly call: ToolCall;
  readonly sanctioned: boolean;
  readonly reason: string;
  readonly output: string;
}

/** The outcome of one chat turn: the model reply plus what its tool calls did. */
export interface ChatTurnResult {
  readonly reply: string;
  readonly runs: ToolRun[];
}

const summarizeCall = (call: ToolCall): string =>
  `${call.tool}(${Object.entries(call.args)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ")})`;

/**
 * Run one chat turn. The llm_call is always declared. Each tool the model emits
 * is executed regardless of the guardrail (the planted weakness); sanctioned
 * calls are additionally wrapped in a declared action, while unsanctioned ones
 * run undeclared — leaving syscalls Argus will surface as unexplained.
 */
export const runChatTurn = async (deps: ChatTurnDeps, userMessage: string): Promise<ChatTurnResult> => {
  const turn = await deps.declare(
    { type: "llm_call", name: deps.llmActionName, input: userMessage },
    () => deps.callLlm(userMessage)
  );

  const runs: ToolRun[] = [];
  for (const call of turn.toolCalls) {
    const decision = evaluateGuardrail(call);
    const summary = summarizeCall(call);

    if (decision.sanctioned) {
      const output = await deps.declare(
        { type: "tool_use", name: call.tool, input: summary },
        () => deps.runTool(call)
      );
      runs.push({ call, sanctioned: true, reason: decision.reason, output });
    } else {
      // The weak guardrail does NOT block — it executes without declaring.
      deps.log.warn("undeclared_tool_execution", { tool: call.tool, reason: decision.reason, summary });
      const output = await deps.runTool(call);
      runs.push({ call, sanctioned: false, reason: decision.reason, output });
    }
  }

  return { reply: turn.text, runs };
};
