import { SYSTEM_PROMPT } from "./prompt.js";
import { parseToolCalls, TOOL_NAMES, type ToolCall, type ToolName } from "./protocol.js";
import type { ModelTurn } from "./loop.js";

/**
 * LLM provider call (I/O at the edge). Uses each provider's NATIVE tool-use API
 * so the model emits structured, real tool calls (not hallucinated text), then
 * normalises them to {@link ToolCall}. Picks a provider by which API key is in
 * the environment. Bring-your-own key (GROQ or ANTHROPIC).
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 600;
// Cap the provider call so a hung LLM endpoint can't block the chat turn (and its
// WebSocket) indefinitely — the turn fails fast and is reported instead.
const LLM_TIMEOUT_MS = 30_000;

/** Tool surface offered to the model — one input string per tool. */
const TOOL_SPECS = [
  { name: "read_file", description: "Read a file from disk.", arg: "path" },
  { name: "http_get", description: "Issue an HTTP GET to a URL.", arg: "url" },
  { name: "run_shell", description: "Run a shell command.", arg: "cmd" },
] as const;

const isToolName = (value: string): value is ToolName => (TOOL_NAMES as readonly string[]).includes(value);

/**
 * Normalise a native tool call (name + structured input) into a {@link ToolCall},
 * or drop it (return null) for an unknown tool — the seam between a provider's
 * wire format and the loop.
 * @function toToolCall
 * @param name - The tool name the provider returned.
 * @param input - The provider's structured arguments.
 * @returns A validated ToolCall with string args, or null.
 */
export const toToolCall = (name: string, input: unknown): ToolCall | null => {
  if (!isToolName(name)) return null;
  const args: Record<string, string> = {};
  if (typeof input === "object" && input !== null) {
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === "string") args[key] = value;
    }
  }
  return { tool: name, args };
};

interface Provider {
  readonly name: string;
  call: (userMessage: string) => Promise<ModelTurn>;
}

const anthropicProvider = (key: string): Provider => ({
  name: "anthropic.claude-haiku",
  call: async (userMessage) => {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: TOOL_SPECS.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: { type: "object", properties: { [t.arg]: { type: "string" } }, required: [t.arg] },
        })),
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic request failed: ${res.status}`);
    const data = (await res.json()) as { content: { type: string; text?: string; name?: string; input?: unknown }[] };
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    const toolCalls = data.content
      .filter((b) => b.type === "tool_use")
      .map((b) => toToolCall(b.name ?? "", b.input))
      .filter((c): c is ToolCall => c !== null);
    return { text, toolCalls: toolCalls.length > 0 ? toolCalls : parseToolCalls(text) };
  },
});

const groqProvider = (key: string): Provider => ({
  name: "groq.llama-3.1-8b-instant",
  call: async (userMessage) => {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: MAX_TOKENS,
        tools: TOOL_SPECS.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: { type: "object", properties: { [t.arg]: { type: "string" } }, required: [t.arg] },
          },
        })),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) throw new Error(`groq request failed: ${res.status}`);
    const data = (await res.json()) as {
      choices: { message: { content: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[];
    };
    const message = data.choices[0]?.message;
    const text = message?.content ?? "";
    const toolCalls = (message?.tool_calls ?? [])
      .map((tc) => {
        try {
          return toToolCall(tc.function.name, JSON.parse(tc.function.arguments));
        } catch {
          return null;
        }
      })
      .filter((c): c is ToolCall => c !== null);
    return { text, toolCalls: toolCalls.length > 0 ? toolCalls : parseToolCalls(text) };
  },
});

/** Select a provider from the environment, or null when no key is configured. */
export const selectProvider = (env: NodeJS.ProcessEnv = process.env): Provider | null => {
  if (env.GROQ_API_KEY) return groqProvider(env.GROQ_API_KEY);
  if (env.ANTHROPIC_API_KEY) return anthropicProvider(env.ANTHROPIC_API_KEY);
  return null;
};
