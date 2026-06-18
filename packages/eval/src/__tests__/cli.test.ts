import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runCli, type CliDeps } from "../cli.js";

const fixtureText = readFileSync(
  fileURLToPath(new URL("../../fixtures/llm_call_decoy.json", import.meta.url)),
  "utf8"
);

const capture = (readFile: () => string) => {
  let out = "";
  let err = "";
  const deps: CliDeps = {
    readFile,
    write: (text) => {
      out += text;
    },
    writeError: (text) => {
      err += text;
    },
  };
  return { deps, out: () => out, err: () => err };
};

describe("runCli", () => {
  it("reports precision/recall for a fixture and exits 0", () => {
    const { deps, out } = capture(() => fixtureText);
    const code = runCli(["node", "cli", "fixtures/llm_call_decoy.json"], deps);
    expect(code).toBe(0);
    expect(out()).toContain("precision: 66.7% (tp=2 fp=1)");
    expect(out()).toContain("recall:    100.0%");
  });

  it("exits 1 with usage when no fixture path is given", () => {
    const { deps, err } = capture(() => "");
    const code = runCli(["node", "cli"], deps);
    expect(code).toBe(1);
    expect(err()).toContain("usage");
  });
});
