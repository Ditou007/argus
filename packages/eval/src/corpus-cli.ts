import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseCorpus } from "./corpus.js";
import { scoreCorpus } from "./score-corpus.js";
import { perActionTypeMetrics } from "./corpus-metrics.js";
import { calibrationBins } from "./calibration.js";
import { unexplainedMetrics } from "./unexplained-metrics.js";
import { formatCorpusReport, formatCalibrationReport, formatUnexplainedReport } from "./report.js";

const DEFAULT_THRESHOLD = 0.7; // the engine's high-confidence band — see SPEC_01 real-run findings
const EXIT_USAGE = 1;
const USAGE = "usage: pnpm --filter @argus/eval exec tsx src/corpus-cli.ts <corpus.json> [threshold]\n";

/** Side effects the CLI needs, injected so the orchestration is testable without real I/O. */
export interface CorpusCliDeps {
  readonly readFile: (path: string) => string;
  readonly write: (text: string) => void;
  readonly writeError: (text: string) => void;
}

/** Score a corpus and print per-action-type metrics at a threshold. Returns the exit code. */
export const runCorpusCli = (argv: readonly string[], deps: CorpusCliDeps): number => {
  const corpusPath = argv[2];
  if (!corpusPath) {
    deps.writeError(USAGE);
    return EXIT_USAGE;
  }
  const threshold = argv[3] !== undefined ? Number(argv[3]) : DEFAULT_THRESHOLD;
  const corpus = parseCorpus(JSON.parse(deps.readFile(corpusPath)));
  const scores = scoreCorpus(corpus);
  const metrics = perActionTypeMetrics(scores, threshold);
  deps.write(`${formatCorpusReport(threshold, metrics)}\n`);
  deps.write(`\n${formatCalibrationReport(calibrationBins(scores))}\n`);
  deps.write(`\n${formatUnexplainedReport(unexplainedMetrics(corpus.events, scores, threshold))}\n`);
  return 0;
};

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  process.exitCode = runCorpusCli(process.argv, {
    readFile: (path) => readFileSync(path, "utf8"),
    write: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
  });
}
