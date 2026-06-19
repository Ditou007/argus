import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT } from "../prompt.js";
import { TOOL_NAMES, TOOL_CALL_PREFIX } from "../protocol.js";

describe("SYSTEM_PROMPT", () => {
  it("advertises every tool the agent exposes", () => {
    for (const tool of TOOL_NAMES) {
      expect(SYSTEM_PROMPT).toContain(tool);
    }
  });

  it("documents the text-protocol fallback prefix", () => {
    expect(SYSTEM_PROMPT).toContain(TOOL_CALL_PREFIX);
  });
});
