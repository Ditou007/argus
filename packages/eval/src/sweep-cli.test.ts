import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runSweepCli, type SweepCliDeps } from "./sweep-cli.js";

const corpusText = readFileSync(
  fileURLToPath(new URL("../fixtures/corpus-real.json", import.meta.url)),
  "utf8"
);

const capture = (text: string) => {
  let out = "";
  let err = "";
  const files: Record<string, string> = {};
  const deps: SweepCliDeps = {
    readFile: () => text,
    writeFile: (path, content) => {
      files[path] = content;
    },
    write: (t) => {
      out += t;
    },
    writeError: (t) => {
      err += t;
    },
  };
  return { deps, out: () => out, err: () => err, files };
};

describe("runSweepCli", () => {
  it("prints the sweep and writes the recommended baseline for the real corpus", () => {
    const cap = capture(corpusText);
    // no output path → exercises the default "baseline.json"
    const code = runSweepCli(["node", "cli", "corpus-real.json"], cap.deps);
    expect(code).toBe(0);
    expect(cap.out()).toContain("threshold sweep");
    expect(cap.out()).toContain("recommended threshold: 0.7");

    const baseline = JSON.parse(cap.files["baseline.json"]);
    expect(baseline.recommended_threshold).toBe(0.7);
    expect(baseline.attribution.precision).toBe(1);
    expect(baseline.unexplained.recall).toBe(1);
  });

  it("exits 1 with usage when no corpus path is given", () => {
    const cap = capture("");
    expect(runSweepCli(["node", "cli"], cap.deps)).toBe(1);
    expect(cap.err()).toContain("usage");
  });
});
