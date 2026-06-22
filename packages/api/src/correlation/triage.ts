/**
 * The unexplained-behaviour triage report — `detectUnexplained` turned from a
 * helper into a product. Per session: a coverage score (how much of the agent's
 * behaviour its declared actions explain) and a risk-ranked feed of the events
 * nothing explains, scored on the claim gap (see {@link riskScore}).
 */
import {
  riskScore,
  sensitivityOf,
  DEFAULT_SENSITIVITY_PROFILE,
  type SensitivityProfile,
  type SensitivityTier,
} from "./risk.js";
import { extractResource, extractFd, extractFilePath, type ResourceRef } from "./resource.js";
import { buildEgressAllowlist } from "./egress.js";
import { resolveFdPaths } from "./fd-path.js";
import { normalizeSyscall } from "./syscall.js";

/** Minimal event shape the triage builder needs. */
export interface TriageInputEvent {
  readonly id: number;
  readonly event_type: string;
  readonly function_name: string | null;
  readonly process_binary: string | null;
  readonly process_pid: number;
  readonly raw_event: Record<string, unknown>;
}

/** One unexplained event, annotated for triage. */
export interface TriageEvent {
  readonly id: number;
  readonly event_type: string;
  readonly function_name: string | null;
  readonly process_binary: string | null;
  readonly resource: ResourceRef;
  readonly best_confidence: number;
  readonly sensitivity: SensitivityTier;
  readonly risk: number;
}

/** Per-session coverage + risk-ranked unexplained feed. */
export interface TriageReport {
  readonly total: number;
  readonly explained: number;
  readonly unexplained: number;
  readonly coverage_ratio: number;
  readonly risk_score: number; // the single worst unexplained event's risk
  readonly events: readonly TriageEvent[];
}

/** Inputs to {@link buildTriageReport}. */
export interface TriageInput {
  /** Every event in the session window. */
  readonly allEvents: readonly TriageInputEvent[];
  /** Ids of events no action explains at the threshold. */
  readonly unexplainedIds: ReadonlySet<number>;
  /** event id → strongest correlation confidence. */
  readonly bestConfidence: ReadonlyMap<number, number>;
  /** IPs the agent declared (union'd with the config baseline). */
  readonly declaredDestinations: readonly string[];
  /** The active sensitivity profile (defaults to the shipped profile). */
  readonly profile?: SensitivityProfile;
}

const FD_INSTALL = "fd_install";
const SYS_WRITE = "sys_write";

// Annotate one unexplained event into a TriageEvent. Shared by the batch builder
// and the streaming accumulator so the two can never produce a different verdict.
const annotateUnexplained = (
  e: TriageInputEvent,
  writePath: string | undefined,
  best_confidence: number,
  profile: SensitivityProfile,
  allowlist: ReturnType<typeof buildEgressAllowlist>
): TriageEvent => {
  const resource: ResourceRef = writePath ? { kind: "file", path: writePath } : extractResource(e.raw_event);
  return {
    id: e.id,
    event_type: e.event_type,
    function_name: e.function_name,
    process_binary: e.process_binary,
    resource,
    best_confidence,
    sensitivity: sensitivityOf(resource, profile, allowlist),
    risk: riskScore(best_confidence, e.raw_event, profile, allowlist),
  };
};

// Assemble the final report from the collected unexplained feed + total count.
const finalizeReport = (events: TriageEvent[], total: number): TriageReport => {
  const sorted = [...events].sort((a, b) => b.risk - a.risk);
  const unexplained = sorted.length;
  const explained = total - unexplained;
  return {
    total,
    explained,
    unexplained,
    coverage_ratio: total === 0 ? 1 : explained / total,
    risk_score: sorted.reduce((max, e) => Math.max(max, e.risk), 0),
    events: sorted,
  };
};

/**
 * Build the triage report from a session's events, the unexplained subset, each
 * event's strongest correlation, and the agent's declared egress destinations.
 * Pure — no I/O — so it is unit-tested directly. For large sessions prefer
 * {@link createTriageAccumulator}, which produces the identical report without
 * holding every event in memory.
 * @function buildTriageReport
 * @param input - See {@link TriageInput}.
 * @returns The {@link TriageReport}.
 */
export const buildTriageReport = (input: TriageInput): TriageReport => {
  const { allEvents, unexplainedIds, bestConfidence, declaredDestinations } = input;
  const profile = input.profile ?? DEFAULT_SENSITIVITY_PROFILE;
  const allowlist = buildEgressAllowlist(declaredDestinations, profile);
  // D14: a write carries only an fd — resolve it to the path it was opened on.
  const resolvedPaths = resolveFdPaths(allEvents);
  const events = allEvents
    .filter((e) => unexplainedIds.has(e.id))
    .map((e) => annotateUnexplained(e, resolvedPaths.get(e.id), bestConfidence.get(e.id) ?? 0, profile, allowlist));
  return finalizeReport(events, allEvents.length);
};

/** Inputs to {@link createTriageAccumulator} — the streaming form of {@link TriageInput}. */
export interface TriageStreamInput {
  /** event id → strongest correlation confidence (built from the session's correlations). */
  readonly bestConfidence: ReadonlyMap<number, number>;
  /** An event counts as unexplained when its best confidence is below this. */
  readonly threshold: number;
  /** IPs the agent declared (union'd with the config baseline). */
  readonly declaredDestinations: readonly string[];
  /** The active sensitivity profile (defaults to the shipped profile). */
  readonly profile?: SensitivityProfile;
}

/**
 * Streaming triage builder: feed a session's events in time order via `push`
 * (e.g. from a paginated cursor) and call `report()` at the end. Runs the
 * **identical** computation as {@link buildTriageReport} — incremental fd→path
 * resolution + per-event risk annotation — but holds only the bounded fd table
 * and the (small) unexplained feed, never the whole firehose. Memory stays flat
 * regardless of session size; results are byte-for-byte identical.
 * @function createTriageAccumulator
 * @param input - See {@link TriageStreamInput}.
 * @returns `{ push, report }` — push each event (time order), then read the report.
 */
export const createTriageAccumulator = (input: TriageStreamInput) => {
  const profile = input.profile ?? DEFAULT_SENSITIVITY_PROFILE;
  const allowlist = buildEgressAllowlist(input.declaredDestinations, profile);
  const fdToPath = new Map<string, string>(); // `${pid}:${fd}` → path (bounded by open fds)
  const events: TriageEvent[] = [];
  let total = 0;

  const push = (e: TriageInputEvent): void => {
    total += 1;
    // Mirror resolveFdPaths incrementally: track fd→path; resolve a write's fd now.
    let writePath: string | undefined;
    const fd = extractFd(e.raw_event);
    if (fd !== null) {
      const fn = normalizeSyscall(e.function_name);
      const key = `${e.process_pid}:${fd}`;
      if (fn === FD_INSTALL) {
        const path = extractFilePath(e.raw_event);
        if (path) fdToPath.set(key, path);
      } else if (fn === SYS_WRITE) {
        writePath = fdToPath.get(key);
      }
    }
    const best = input.bestConfidence.get(e.id) ?? 0;
    if (best < input.threshold) {
      events.push(annotateUnexplained(e, writePath, best, profile, allowlist));
    }
  };

  return { push, report: (): TriageReport => finalizeReport(events, total) };
};
