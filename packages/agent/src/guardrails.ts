import type { ToolCall } from "./protocol.js";

/**
 * The agent's (deliberately weak) guardrail. It decides whether a tool call is
 * *sanctioned* — i.e. whether the agent declares it to Argus as intended work.
 *
 * Crucially, the guardrail does NOT block: the loop still executes unsanctioned
 * calls. That is the planted vulnerability — an unsanctioned call runs but is
 * never declared, so its syscalls have no matching action and Argus surfaces
 * them as unexplained. A benign request produces only sanctioned (declared)
 * calls; a malicious one drives the model into unsanctioned (undeclared) ones.
 */

/** Substrings that mark a path as a sensitive resource a benign agent never reads. */
const SENSITIVE_PATH_MARKERS = [
  ".ssh",
  "id_rsa",
  "id_ed25519",
  ".aws",
  ".env",
  "shadow",
  ".pem",
  "credentials",
  ".npmrc",
  ".git-credentials",
] as const;

/** Path prefixes / exact files a benign agent is allowed to read. */
const READABLE_PREFIXES = ["/workspace/"] as const;
const READABLE_FILES = ["/etc/hostname", "/etc/os-release"] as const;

/** Hosts the agent is allowed to reach (LLM providers + inert demo hosts). */
const ALLOWED_HOSTS = [
  "api.groq.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "example.com",
] as const;

/** Shell commands whose first token is considered safe (read-only, no side effects). */
const SAFE_SHELL_COMMANDS = ["echo", "ls", "pwd", "date", "whoami", "uname", "hostname"] as const;

/** Shell metacharacters that chain/substitute and can smuggle dangerous work. */
const SHELL_CHAINING = /[|&;`$><]/;

/** A guardrail verdict: whether the call is declared, and a human-readable why. */
export interface GuardrailDecision {
  readonly sanctioned: boolean;
  readonly reason: string;
}

const sanction = (reason: string): GuardrailDecision => ({ sanctioned: true, reason });
const reject = (reason: string): GuardrailDecision => ({ sanctioned: false, reason });

const evaluateReadFile = (path: string | undefined): GuardrailDecision => {
  if (!path) return reject("read_file: no path given");
  if (SENSITIVE_PATH_MARKERS.some((marker) => path.includes(marker))) {
    return reject(`read_file: sensitive resource (${path})`);
  }
  if (READABLE_FILES.includes(path as (typeof READABLE_FILES)[number])) return sanction(`read_file: allowlisted file (${path})`);
  if (READABLE_PREFIXES.some((prefix) => path.startsWith(prefix))) return sanction(`read_file: allowlisted path (${path})`);
  return reject(`read_file: path outside the workspace allowlist (${path})`);
};

const evaluateHttpGet = (url: string | undefined): GuardrailDecision => {
  if (!url) return reject("http_get: no url given");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return reject(`http_get: malformed url (${url})`);
  }
  if (ALLOWED_HOSTS.includes(host as (typeof ALLOWED_HOSTS)[number])) return sanction(`http_get: allowlisted host (${host})`);
  return reject(`http_get: host not on the allowlist (${host})`);
};

const evaluateRunShell = (cmd: string | undefined): GuardrailDecision => {
  if (!cmd || !cmd.trim()) return reject("run_shell: empty command");
  if (SHELL_CHAINING.test(cmd)) return reject("run_shell: command chains or substitutes");
  // Deliberately weak: only the first token is screened, not its arguments — so
  // e.g. `ls /root/.ssh` is sanctioned. That under-classification is fine for the
  // demo: a sanctioned call is still *declared* (hence "explained"), and the moat
  // is about *undeclared* behaviour. A hardened agent would screen arguments too.
  const firstToken = cmd.trim().split(/\s+/)[0];
  if (firstToken && SAFE_SHELL_COMMANDS.includes(firstToken as (typeof SAFE_SHELL_COMMANDS)[number])) {
    return sanction(`run_shell: safe command (${firstToken})`);
  }
  return reject(`run_shell: command not on the safe allowlist (${firstToken ?? ""})`);
};

/** Decide whether a tool call is sanctioned (declared) under the weak guardrail. */
export const evaluateGuardrail = (call: ToolCall): GuardrailDecision => {
  switch (call.tool) {
    case "read_file":
      return evaluateReadFile(call.args.path);
    case "http_get":
      return evaluateHttpGet(call.args.url);
    case "run_shell":
      return evaluateRunShell(call.args.cmd);
  }
};
