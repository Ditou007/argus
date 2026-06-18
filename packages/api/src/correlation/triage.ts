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
import { extractResource, type ResourceRef } from "./resource.js";
import { buildEgressAllowlist } from "./egress.js";

/** Minimal event shape the triage builder needs. */
export interface TriageInputEvent {
  readonly id: number;
  readonly event_type: string;
  readonly function_name: string | null;
  readonly process_binary: string | null;
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

/**
 * Build the triage report from a session's events, the unexplained subset, each
 * event's strongest correlation, and the agent's declared egress destinations.
 * Pure — no I/O — so it is unit-tested directly.
 * @function buildTriageReport
 * @param input - See {@link TriageInput}.
 * @returns The {@link TriageReport}.
 */
export const buildTriageReport = (input: TriageInput): TriageReport => {
  const { allEvents, unexplainedIds, bestConfidence, declaredDestinations } = input;
  const profile = input.profile ?? DEFAULT_SENSITIVITY_PROFILE;
  const allowlist = buildEgressAllowlist(declaredDestinations, profile);

  const events: TriageEvent[] = allEvents
    .filter((e) => unexplainedIds.has(e.id))
    .map((e) => {
      const best_confidence = bestConfidence.get(e.id) ?? 0;
      const resource = extractResource(e.raw_event);
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
    })
    .sort((a, b) => b.risk - a.risk);

  const total = allEvents.length;
  const unexplained = events.length;
  const explained = total - unexplained;
  return {
    total,
    explained,
    unexplained,
    coverage_ratio: total === 0 ? 1 : explained / total,
    risk_score: events.reduce((max, e) => Math.max(max, e.risk), 0),
    events,
  };
};
