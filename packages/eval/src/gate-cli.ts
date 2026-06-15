import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseCorpus } from "./corpus.js";
import { scoreCorpus } from "./score-corpus.js";
import { sweepThresholds, type Baseline } from "./sweep.js";
import { checkRegression, DEFAULT_TOLERANCE } from "./gate.js";

const EXIT_USAGE = 1;
const EXIT_REGRESSION = 1;
const DP = 3;
const USAGE =
  "usage: pnpm --filter @argus/eval exec tsx src/gate-cli.ts <corpus.json> <baseline.json> [tolerance]\n";

/** Side effects the CLI needs, injected so the orchestration is testable without real I/O. */
export interface GateCliDeps {
  readonly readFile: (path: string) => string;
  readonly write: (text: string) => void;
  readonly writeError: (text: string) => void;
}

/** Score the corpus and fail (exit 1) if any tracked metric regressed below the baseline. */
export const runGateCli = (argv: readonly string[], deps: GateCliDeps): number => {
  const corpusPath = argv[2];
  const baselinePath = argv[3];
  if (!corpusPath || !baselinePath) {
    deps.writeError(USAGE);
    return EXIT_USAGE;
  }
  const tolerance = argv[4] !== undefined ? Number(argv[4]) : DEFAULT_TOLERANCE;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    // A NaN/negative tolerance would silently disable the gate — fail loudly instead.
    deps.writeError(`tolerance must be a non-negative number\n${USAGE}`);
    return EXIT_USAGE;
  }

  const corpus = parseCorpus(JSON.parse(deps.readFile(corpusPath)));
  const baseline: Baseline = JSON.parse(deps.readFile(baselinePath));
  const scores = scoreCorpus(corpus);
  const point = sweepThresholds(corpus.events, scores, [baseline.recommended_threshold])[0];
  const current = {
    attribution_f1: point.attribution.f1,
    unexplained_recall: point.unexplained.recall,
  };
  const result = checkRegression(current, baseline, tolerance);

  if (!result.ok) {
    deps.writeError(`eval-gate FAILED:\n${result.failures.map((f) => `  - ${f}`).join("\n")}\n`);
    return EXIT_REGRESSION;
  }
  deps.write(
    `eval-gate OK @ threshold ${baseline.recommended_threshold}: ` +
      `attribution F1 ${current.attribution_f1.toFixed(DP)} (baseline ${baseline.attribution.f1.toFixed(DP)}), ` +
      `unexplained recall ${current.unexplained_recall.toFixed(DP)} (baseline ${baseline.unexplained.recall.toFixed(DP)})\n`
  );
  return 0;
};

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  process.exitCode = runGateCli(process.argv, {
    readFile: (path) => readFileSync(path, "utf8"),
    write: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
  });
}
