import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runCorpusCli, type CorpusCliDeps } from "../corpus-cli.js";

const corpusText = readFileSync(
  fileURLToPath(new URL("../../fixtures/corpus-real.json", import.meta.url)),
  "utf8"
);

const capture = (text: string) => {
  let out = "";
  let err = "";
  const deps: CorpusCliDeps = {
    readFile: () => text,
    write: (t) => {
      out += t;
    },
    writeError: (t) => {
      err += t;
    },
  };
  return { deps, out: () => out, err: () => err };
};

describe("runCorpusCli", () => {
  it("reports per-type metrics for the real corpus and exits 0", () => {
    const { deps, out } = capture(corpusText);
    const code = runCorpusCli(["node", "cli", "corpus-real.json", "0.7"], deps);
    expect(code).toBe(0);
    expect(out()).toContain("corpus metrics @ threshold 0.7");
    expect(out()).toContain("llm_call");
    expect(out()).toContain("file_write");
    expect(out()).toContain("calibration (emitted correlations, uncertain excluded)");
    expect(out()).toContain("0.9-1.0");
    expect(out()).toContain("unexplained-behaviour detection @ threshold 0.7");
  });

  it("exits 1 with usage when no path is given", () => {
    const { deps, err } = capture("");
    expect(runCorpusCli(["node", "cli"], deps)).toBe(1);
    expect(err()).toContain("usage");
  });
});
