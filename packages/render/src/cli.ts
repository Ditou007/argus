import { fileURLToPath } from "node:url";
import { formatTriage } from "./format.js";
import { renderText } from "./text.js";
import type { TriageReport } from "./format.js";

/**
 * `pnpm demo` CLI — the headless fallback for the live UI. Fetches a session's
 * triage from the Argus API and prints the same legible view the dashboard shows.
 * I/O (fetch, stdout) is injected so the orchestration is unit-testable.
 */

export interface CliDeps {
  readonly apiBase: string;
  readonly sessionId?: string;
  readonly fetch: typeof fetch;
  readonly out: (line: string) => void;
}

/** Fetch JSON, throwing on a non-2xx response so a failure can never render as an all-clear. */
const getJson = async (deps: CliDeps, url: string): Promise<unknown> => {
  const res = await deps.fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
};

const latestSessionId = async (deps: CliDeps): Promise<string | null> => {
  const body = (await getJson(deps, `${deps.apiBase}/api/sessions`)) as { sessions?: { id: string | number }[] };
  const first = body.sessions?.[0];
  return first ? String(first.id) : null;
};

/**
 * Run the CLI; returns a process exit code (0 ok, 1 nothing to show or error).
 * A failed API call returns a non-zero code with an explicit error — never a
 * misleading "all clear" — because for a detection tool a silent success on
 * failure is the most dangerous outcome.
 */
export const runCli = async (deps: CliDeps): Promise<number> => {
  try {
    const sessionId = deps.sessionId ?? (await latestSessionId(deps));
    if (!sessionId) {
      deps.out("No sessions found — start the agent and chat with it first.");
      return 1;
    }
    const report = (await getJson(deps, `${deps.apiBase}/api/sessions/${sessionId}/unexplained`)) as TriageReport;
    deps.out(renderText(formatTriage(report)));
    return 0;
  } catch (err) {
    deps.out(`Could not reach the Argus API: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
};

// Auto-run only when executed directly, not when imported by a test.
const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  const apiBase = process.env.ARGUS_API_URL ?? "http://localhost:3001";
  runCli({ apiBase, sessionId: process.argv[2], fetch, out: (s) => process.stdout.write(`${s}\n`) })
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      process.stdout.write(`demo failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}
