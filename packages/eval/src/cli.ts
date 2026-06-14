import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseFixture } from "./fixture.js";
import { scoreFixture } from "./score-fixture.js";
import { precisionRecall } from "./metrics.js";
import { formatReport } from "./report.js";

// The medium-confidence band cutoff the engine uses; the default reporting
// threshold for the harness until the sweep (Slice 8) recommends one from data.
const DEFAULT_THRESHOLD = 0.3;
const EXIT_OK = 0;
const EXIT_USAGE = 1;
const USAGE = "usage: pnpm --filter @argus/eval eval <fixture.json>\n";

/** Side effects the CLI needs, injected so the orchestration is testable without real I/O. */
export interface CliDeps {
  readonly readFile: (path: string) => string;
  readonly write: (text: string) => void;
  readonly writeError: (text: string) => void;
}

/** Parse → score → measure → report a fixture. Returns the process exit code. */
export const runCli = (argv: readonly string[], deps: CliDeps): number => {
  const fixturePath = argv[2];
  if (!fixturePath) {
    deps.writeError(USAGE);
    return EXIT_USAGE;
  }
  const fixture = parseFixture(JSON.parse(deps.readFile(fixturePath)));
  const scored = scoreFixture(fixture);
  const metrics = precisionRecall(scored, DEFAULT_THRESHOLD);
  deps.write(`${formatReport(fixture.name, metrics)}\n`);
  return EXIT_OK;
};

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.exitCode = runCli(process.argv, {
    readFile: (path) => readFileSync(path, "utf8"),
    write: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
  });
}
