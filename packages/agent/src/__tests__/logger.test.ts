import { describe, it, expect, vi } from "vitest";
import { logger } from "../logger.js";

const capture = (fn: () => void): string[] => {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  fn();
  spy.mockRestore();
  return lines;
};

describe("logger", () => {
  it("emits one JSON line per call with level + event + fields", () => {
    const [line] = capture(() => logger.warn("undeclared_tool_execution", { tool: "read_file" }));
    expect(JSON.parse(line)).toEqual({ level: "warn", event: "undeclared_tool_execution", tool: "read_file" });
  });

  it("emits the correct level for info and error", () => {
    const [info] = capture(() => logger.info("started"));
    const [err] = capture(() => logger.error("boom"));
    expect(JSON.parse(info).level).toBe("info");
    expect(JSON.parse(err).level).toBe("error");
  });
});
