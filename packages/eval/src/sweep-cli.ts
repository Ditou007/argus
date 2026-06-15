import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseCorpus } from "./corpus.js";
import { scoreCorpus } from "./score-corpus.js";
import { sweepThresholds, buildBaseline, DEFAULT_THRESHOLDS } from "./sweep.js";

const EXIT_USAGE = 1;
const PCT = 100;
const DP = 1;
const USAGE =
  "usage: pnpm --filter @argus/eval exec tsx src/sweep-cli.ts <corpus.json> [baseline-out.json]\n";

const pct = (ratio: number): string => `${(ratio * PCT).toFixed(DP)}%`.padStart(6);

/** Side effects the CLI needs, injected so the orchestration is testable without real I/O. */
export interface SweepCliDeps {
  readonly readFile: (path: string) => string;
  readonly writeFile: (path: string, text: string) => void;
  readonly write: (text: string) => void;
  readonly writeError: (text: string) => void;
}

/** Sweep thresholds over a corpus, print the curve, and write the committed baseline. */
export const runSweepCli = (argv: readonly string[], deps: SweepCliDeps): number => {
  const corpusPath = argv[2];
  if (!corpusPath) {
    deps.writeError(USAGE);
    return EXIT_USAGE;
  }
  const baselinePath = argv[3] ?? "baseline.json";
  const corpus = parseCorpus(JSON.parse(deps.readFile(corpusPath)));
  const scores = scoreCorpus(corpus);

  const sweep = sweepThresholds(corpus.events, scores, DEFAULT_THRESHOLDS);
  const header = "thresh  attr_prec  attr_rec  attr_f1  unexpl_prec  unexpl_rec";
  const rows = sweep.map(
    (p) =>
      `${p.threshold.toFixed(DP)}    ${pct(p.attribution.precision)}   ${pct(p.attribution.recall)}  ` +
      `${p.attribution.f1.toFixed(2)}    ${pct(p.unexplained.precision)}     ${pct(p.unexplained.recall)}`
  );
  deps.write(["threshold sweep", header, ...rows].join("\n") + "\n");

  const baseline = buildBaseline(corpus.events, scores, DEFAULT_THRESHOLDS);
  deps.writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  deps.write(`\nrecommended threshold: ${baseline.recommended_threshold} → ${baselinePath}\n`);
  return 0;
};

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  process.exitCode = runSweepCli(process.argv, {
    readFile: (path) => readFileSync(path, "utf8"),
    writeFile: (path, text) => writeFileSync(path, text),
    write: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
  });
}
