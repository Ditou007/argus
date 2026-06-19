import { describe, it, expect, vi } from "vitest";

// No provider key configured → selectProvider returns null.
vi.mock("../llm.js", () => ({ selectProvider: vi.fn(() => null) }));

import { main } from "../index.js";
import { selectProvider } from "../llm.js";

describe("agent bootstrap (main)", () => {
  it("exits non-zero when no LLM provider key is configured", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);

    await expect(main()).rejects.toThrow("exit:1");
    expect(selectProvider).toHaveBeenCalled();

    exit.mockRestore();
  });
});
