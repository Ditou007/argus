import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runGateCli, type GateCliDeps } from "../gate-cli.js";

const corpusText = readFileSync(
  fileURLToPath(new URL("../../fixtures/corpus-real.json", import.meta.url)),
  "utf8"
);
const baselineText = readFileSync(
  fileURLToPath(new URL("../../fixtures/baseline.json", import.meta.url)),
  "utf8"
);

const capture = (files: Record<string, string>) => {
  let out = "";
  let err = "";
  const deps: GateCliDeps = {
    readFile: (path) => files[path] ?? "",
    write: (t) => {
      out += t;
    },
    writeError: (t) => {
      err += t;
    },
  };
  return { deps, out: () => out, err: () => err };
};

describe("runGateCli", () => {
  it("exits 0 when the committed baseline still holds", () => {
    const cap = capture({ "corpus.json": corpusText, "baseline.json": baselineText });
    const code = runGateCli(["node", "cli", "corpus.json", "baseline.json"], cap.deps);
    expect(code).toBe(0);
    expect(cap.out()).toContain("eval-gate OK");
  });

  it("exits 1 naming the metric when a metric regresses below an inflated baseline", () => {
    // a baseline demanding F1 1.0 can't be met (real corpus is 0.9) → regression
    const inflated = JSON.stringify({
      recommended_threshold: 0.7,
      attribution: { precision: 1, recall: 1, f1: 1 },
      unexplained: { precision: 1, recall: 1 },
    });
    const cap = capture({ "corpus.json": corpusText, "baseline.json": inflated });
    const code = runGateCli(["node", "cli", "corpus.json", "baseline.json"], cap.deps);
    expect(code).toBe(1);
    expect(cap.err()).toContain("eval-gate FAILED");
    expect(cap.err()).toContain("attribution F1");
  });

  it("exits 1 with usage when args are missing", () => {
    const cap = capture({});
    expect(runGateCli(["node", "cli"], cap.deps)).toBe(1);
    expect(cap.err()).toContain("usage");
  });

  it("rejects a non-numeric tolerance instead of silently disabling the gate", () => {
    const cap = capture({ "corpus.json": corpusText, "baseline.json": baselineText });
    // NaN tolerance would make every `< baseline - NaN` comparison false → false OK
    const code = runGateCli(["node", "cli", "corpus.json", "baseline.json", "oops"], cap.deps);
    expect(code).toBe(1);
    expect(cap.err()).toContain("tolerance must be a non-negative number");
  });
});
