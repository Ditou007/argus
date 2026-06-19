import { describe, it, expect } from "vitest";
import { selectProvider, toToolCall } from "../llm.js";

describe("selectProvider", () => {
  it("returns null when no provider key is set", () => {
    expect(selectProvider({})).toBeNull();
  });

  it("selects Groq when GROQ_API_KEY is present", () => {
    expect(selectProvider({ GROQ_API_KEY: "x" })?.name).toMatch(/groq/);
  });

  it("selects Anthropic when only ANTHROPIC_API_KEY is present", () => {
    expect(selectProvider({ ANTHROPIC_API_KEY: "y" })?.name).toMatch(/anthropic/);
  });

  it("prefers Groq when both keys are present", () => {
    expect(selectProvider({ GROQ_API_KEY: "x", ANTHROPIC_API_KEY: "y" })?.name).toMatch(/groq/);
  });
});

describe("toToolCall (provider response normalisation)", () => {
  it("normalises a known tool with string args", () => {
    expect(toToolCall("read_file", { path: "/etc/hostname" })).toEqual({
      tool: "read_file",
      args: { path: "/etc/hostname" },
    });
  });

  it("drops an unknown tool name", () => {
    expect(toToolCall("rm_rf", { path: "/" })).toBeNull();
  });

  it("keeps only string-valued args and tolerates non-object input", () => {
    expect(toToolCall("http_get", { url: "https://x", retries: 3 })).toEqual({
      tool: "http_get",
      args: { url: "https://x" },
    });
    expect(toToolCall("run_shell", null)).toEqual({ tool: "run_shell", args: {} });
  });
});
