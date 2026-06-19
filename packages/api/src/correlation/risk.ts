/**
 * Risk scoring for unexplained events — the differentiated half of Argus's
 * product. An unexplained `/tmp` write is noise; an unexplained read of
 * `~/.ssh/id_rsa` or a connect to a non-allowlisted host is the alert. We score
 * on the claim gap, not generic anomaly detection:
 *
 *   risk = sensitivity(resource) × (1 − best_confidence)
 *
 * `(1 − best_confidence)` grades *how* unexplained an event is (a near-miss at
 * 0.69 scores below a total orphan at 0.0). `sensitivity` comes from a
 * {@link SensitivityProfile} — shipped with a sensible default, but fully
 * overridable by a consumer (no magic values baked into code).
 */
import { extractResource, type ResourceRef } from "./resource.js";

export type SensitivityTier = "high" | "medium" | "low";
const TIERS: readonly SensitivityTier[] = ["high", "medium", "low"];

/** The consumer-configurable sensitivity profile that drives risk. */
export interface SensitivityProfile {
  /** Weight per tier, e.g. { high: 1.0, medium: 0.5, low: 0.1 }. */
  readonly tierWeights: Readonly<Record<SensitivityTier, number>>;
  /** Globs whose file path is HIGH sensitivity (credentials/secrets). */
  readonly credentialPathGlobs: readonly string[];
  /** Path prefixes that are LOW sensitivity (ephemeral/noise). */
  readonly lowSensitivityPathPrefixes: readonly string[];
  /**
   * Globs (depth-independent) that are LOW sensitivity — runtime/dependency
   * noise common to the agent runtimes Argus instruments (Node AND Python):
   * package dirs, bytecode, and stdlib that every process reads at load.
   */
  readonly lowSensitivityPathGlobs: readonly string[];
  /** Config baseline of allowed network destinations (Slice 4 unions declared dests). */
  readonly egressAllowlist: readonly string[];
  /**
   * Extended-regex sources for destinations treated as expected/internal (LOW)
   * beyond loopback. EMPTY in the shipped default — a conservative default must
   * NOT silently de-prioritise internal egress (lateral movement) or link-local
   * (`169.254.*`, cloud-metadata SSRF, a classic exfil target). A deployment that
   * wants its private service-mesh quietened opts in (see DEMO profile).
   */
  readonly expectedDestinationRegexes: readonly string[];
  /** Tier for a file path matching neither credential nor low rules. */
  readonly defaultFileTier: SensitivityTier;
  /** Tier for a connect to a destination not on the allowlist. */
  readonly defaultNetworkTier: SensitivityTier;
}

/** The shipped default profile (grounded in the README's own examples). */
export const DEFAULT_SENSITIVITY_PROFILE: SensitivityProfile = {
  tierWeights: { high: 1.0, medium: 0.5, low: 0.1 },
  credentialPathGlobs: [
    "**/.ssh/**",
    "**/.aws/**",
    "**/.kube/**",
    "/etc/shadow",
    "**/*.pem",
    "**/*.key",
    "*.pem",
    "*.key",
    "**/.netrc",
    "**/.git-credentials",
  ],
  lowSensitivityPathPrefixes: [
    "/tmp/",
    "/var/tmp/",
    "/etc/resolv.conf",
    "/sys/", // sysfs / cgroup introspection
    "/etc/ssl/openssl.cnf", // TLS config (NOT keys — those match the credential glob first)
    "/etc/ssl/certs/", // public CA bundle
  ],
  // Runtime/dependency noise common to ANY process and to BOTH instrumented
  // runtimes — a node or python agent reads hundreds of these at load; they are
  // not "agent behaviour" and must not rank with a genuine credential read.
  lowSensitivityPathGlobs: [
    "**/node_modules/**", // Node deps
    "**/site-packages/**", // Python deps (venv / system)
    "**/dist-packages/**", // Python deps (Debian)
    "**/__pycache__/**", // Python bytecode dir
    "**/*.pyc", // Python bytecode
    "/usr/lib/python*/**", // Python stdlib
    "/usr/local/lib/python*/**",
    "**/*.so", // shared libraries (native deps, both runtimes)
    "**/*.so.*",
    // System info files (anchored exact match, so e.g. /proc/cpuinfo only).
    "/proc/cpuinfo",
    "/proc/meminfo",
    "/proc/stat",
    "/proc/loadavg",
    // Benign per-process introspection (any pid incl. self) — NOT environ/mem,
    // which can hold secrets and so deliberately fall through to default tier.
    "/proc/*/auxv",
    "/proc/*/cgroup",
    "/proc/*/status",
    "/proc/*/stat",
    "/proc/*/maps",
    "/proc/*/limits",
    "/proc/*/cmdline",
  ],
  egressAllowlist: [],
  // Conservative: only loopback is benign-by-destination. Internal egress and
  // link-local stay at defaultNetworkTier (HIGH) so lateral movement and
  // metadata-SSRF are NOT hidden by default.
  expectedDestinationRegexes: [],
  defaultFileTier: "medium",
  defaultNetworkTier: "high",
};

/**
 * Demo-scoped profile: the single-host `docker compose` demo is a noisy service
 * mesh (agent→API, Postgres, Redis on a private Docker bridge), so it opts into
 * treating RFC1918 **private** ranges as expected/LOW — keeping the attack's
 * PUBLIC exfil on top. Link-local (`169.254.*`, metadata SSRF) is deliberately
 * NOT included: it stays HIGH even in the demo.
 */
export const DEMO_SENSITIVITY_PROFILE: SensitivityProfile = {
  ...DEFAULT_SENSITIVITY_PROFILE,
  expectedDestinationRegexes: ["^10\\.", "^192\\.168\\.", "^172\\.(1[6-9]|2\\d|3[01])\\."],
};

/** Select the active profile from the environment (the demo opts in via env). */
export const profileFromEnv = (env: NodeJS.ProcessEnv = process.env): SensitivityProfile =>
  env.ARGUS_SENSITIVITY_PROFILE === "demo" ? DEMO_SENSITIVITY_PROFILE : DEFAULT_SENSITIVITY_PROFILE;

/** Convert a glob (`**` across segments, `*` within one) to an anchored RegExp. */
const globToRegExp = (glob: string): RegExp => {
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i += 1;
    } else if (c === "*") {
      re += "[^/]*";
    } else if ("\\^$+?.()|[]{}".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
};

const matchesAnyGlob = (path: string, globs: readonly string[]): boolean =>
  globs.some((g) => globToRegExp(g).test(path));

/** Loopback — always benign by destination, regardless of profile/allowlist. */
const LOOPBACK = /^(127\.|::1$|0\.0\.0\.0$)/;

/**
 * A destination is "expected" (LOW) if it's loopback, matches one of the
 * profile's `expectedDestinationRegexes`, or is on the effective allowlist.
 */
const isExpectedDestination = (
  daddr: string,
  allowlist: readonly string[],
  expectedRegexes: readonly string[]
): boolean =>
  LOOPBACK.test(daddr) ||
  allowlist.includes(daddr) ||
  expectedRegexes.some((source) => new RegExp(source).test(daddr));

/**
 * Classify a resource's sensitivity tier under a profile.
 * @function sensitivityOf
 * @param resource - The resource the event touched.
 * @param profile - The active sensitivity profile.
 * @param egressAllowlist - Effective allowlist (declared ∪ config); defaults to the profile's.
 * @returns The sensitivity tier.
 */
export const sensitivityOf = (
  resource: ResourceRef,
  profile: SensitivityProfile,
  egressAllowlist?: readonly string[]
): SensitivityTier => {
  if (resource.kind === "file") {
    if (matchesAnyGlob(resource.path, profile.credentialPathGlobs)) return "high";
    if (profile.lowSensitivityPathPrefixes.some((p) => resource.path.startsWith(p))) return "low";
    if (matchesAnyGlob(resource.path, profile.lowSensitivityPathGlobs)) return "low";
    return profile.defaultFileTier;
  }
  if (resource.kind === "network") {
    const allowed = egressAllowlist ?? profile.egressAllowlist;
    return isExpectedDestination(resource.daddr, allowed, profile.expectedDestinationRegexes)
      ? "low"
      : profile.defaultNetworkTier;
  }
  return "low";
};

/**
 * Score an unexplained event: `sensitivity × (1 − best_confidence)`, in [0,1].
 * @function riskScore
 * @param bestConfidence - The event's strongest correlation to any action.
 * @param raw - The raw Tetragon event (to extract the resource touched).
 * @param profile - The active sensitivity profile.
 * @param egressAllowlist - Effective allowlist (declared ∪ config); defaults to the profile's.
 * @returns The risk score.
 */
export const riskScore = (
  bestConfidence: number,
  raw: Record<string, unknown>,
  profile: SensitivityProfile = DEFAULT_SENSITIVITY_PROFILE,
  egressAllowlist?: readonly string[]
): number => {
  const tier = sensitivityOf(extractResource(raw), profile, egressAllowlist);
  const residual = Math.max(0, 1 - bestConfidence);
  return profile.tierWeights[tier] * residual;
};

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

const STRING_ARRAY_KEYS = [
  "credentialPathGlobs",
  "lowSensitivityPathPrefixes",
  "lowSensitivityPathGlobs",
  "egressAllowlist",
  "expectedDestinationRegexes",
] as const;
const TIER_KEYS = ["defaultFileTier", "defaultNetworkTier"] as const;

const assertObject = (input: unknown): Record<string, unknown> => {
  if (typeof input !== "object" || input === null) {
    throw new Error("sensitivity profile must be an object");
  }
  return input as Record<string, unknown>;
};

const assertTierWeights = (weights: unknown): void => {
  if (typeof weights !== "object" || weights === null) {
    throw new Error("sensitivity profile: tierWeights must be an object");
  }
  const w = weights as Record<string, unknown>;
  for (const tier of TIERS) {
    const v = w[tier];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      throw new Error(`sensitivity profile: tierWeights.${tier} must be a number in [0,1]`);
    }
  }
};

const assertStringArrays = (p: Record<string, unknown>): void => {
  for (const key of STRING_ARRAY_KEYS) {
    if (!isStringArray(p[key])) {
      throw new Error(`sensitivity profile: ${key} must be an array of strings`);
    }
  }
};

const assertTierFields = (p: Record<string, unknown>): void => {
  for (const key of TIER_KEYS) {
    if (!TIERS.includes(p[key] as SensitivityTier)) {
      throw new Error(`sensitivity profile: ${key} must be one of high|medium|low`);
    }
  }
};

/**
 * Validate a consumer-supplied sensitivity profile, throwing a clear error on
 * any malformed field. Returns the value typed as a {@link SensitivityProfile}.
 * @function parseSensitivityProfile
 * @param input - Untrusted profile (e.g. from a config file).
 * @returns The validated profile.
 */
export const parseSensitivityProfile = (input: unknown): SensitivityProfile => {
  const p = assertObject(input);
  assertTierWeights(p.tierWeights);
  assertStringArrays(p);
  assertTierFields(p);
  return input as SensitivityProfile;
};
