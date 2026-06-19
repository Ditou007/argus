/**
 * Pure formatter: turn the raw triage feed into a legible, risk-ranked view —
 * the single source of truth both the demo UI and the `pnpm demo` CLI render.
 * No I/O, no formatting library: just data → a plain-language view model.
 *
 * Types are co-located here (the primary module) so the package has no
 * behaviour-free source file.
 */

export type SensitivityTier = "high" | "medium" | "low";

/** The resource an event touched (file path or network destination). */
export type TriageResource =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "network"; readonly daddr: string; readonly dport: number }
  | { readonly kind: "other" };

/** One risk-scored unexplained event from the triage feed (`GET /api/sessions/:id/unexplained`). */
export interface TriageFeedEvent {
  readonly id: number;
  readonly event_type: string;
  readonly function_name: string | null;
  readonly process_binary: string | null;
  readonly resource: TriageResource;
  readonly best_confidence: number;
  readonly sensitivity: SensitivityTier;
  readonly risk: number;
}

/** The per-session triage report. */
export interface TriageReport {
  readonly total: number;
  readonly explained: number;
  readonly unexplained: number;
  readonly coverage_ratio: number;
  readonly risk_score: number;
  readonly events: readonly TriageFeedEvent[];
}

export type RiskBand = "HIGH" | "MEDIUM" | "LOW";

/** One event rendered in plain language for a human. */
export interface FormattedEvent {
  readonly id: number;
  readonly band: RiskBand;
  readonly risk: number;
  readonly sensitivity: SensitivityTier;
  /** Plain-language action, e.g. "Read credential file /root/.ssh/id_rsa". */
  readonly action: string;
  /** The resource touched, e.g. "/root/.ssh/id_rsa" or "1.1.1.1:443". */
  readonly resource: string;
  /** Why it's flagged, e.g. "Unexplained — no declared action accounts for it". */
  readonly reason: string;
}

/** The legible view model the UI and CLI both render. */
export interface DemoView {
  readonly coveragePct: number;
  readonly summary: string;
  readonly highRiskCount: number;
  /** Events ranked by risk, descending. */
  readonly events: readonly FormattedEvent[];
}

/** Risk-band cutoffs (risk = sensitivity × (1 − best_confidence), in [0,1]). */
const HIGH_BAND = 0.7;
const MEDIUM_BAND = 0.3;
const PERCENT = 100;

const bandOf = (risk: number): RiskBand => {
  if (risk >= HIGH_BAND) return "HIGH";
  if (risk >= MEDIUM_BAND) return "MEDIUM";
  return "LOW";
};

const resourceLabel = (resource: TriageResource): string => {
  switch (resource.kind) {
    case "file":
      return resource.path;
    case "network":
      return `${resource.daddr}:${resource.dport}`;
    case "other":
      return "(unknown resource)";
  }
};

const FILE_VERBS: Readonly<Record<string, string>> = { fd_install: "Read", sys_write: "Wrote to" };
const NET_VERBS: Readonly<Record<string, string>> = { tcp_connect: "Connected to", tcp_sendmsg: "Sent data to" };

/** Plain-language description of what the event did. */
const actionLabel = (event: TriageFeedEvent): string => {
  const fn = event.function_name ?? event.event_type;
  if (event.resource.kind === "file") {
    const verb = FILE_VERBS[fn] ?? "Accessed";
    const noun = event.sensitivity === "high" ? "credential file" : "file";
    return `${verb} ${noun} ${event.resource.path}`;
  }
  if (event.resource.kind === "network") {
    const verb = NET_VERBS[fn] ?? "Reached";
    return `${verb} ${resourceLabel(event.resource)}`;
  }
  return `${fn} (${resourceLabel(event.resource)})`;
};

/** Why the event is flagged: a total orphan vs a weak (sub-threshold) match. */
const reasonLabel = (bestConfidence: number): string => {
  if (bestConfidence <= 0) return "Unexplained — no declared action accounts for it";
  return `Weakly explained — best declared match only ${Math.round(bestConfidence * PERCENT)}%`;
};

const toFormatted = (event: TriageFeedEvent): FormattedEvent => ({
  id: event.id,
  band: bandOf(event.risk),
  risk: event.risk,
  sensitivity: event.sensitivity,
  action: actionLabel(event),
  resource: resourceLabel(event.resource),
  reason: reasonLabel(event.best_confidence),
});

const summarize = (coveragePct: number, highRiskCount: number, unexplained: number): string => {
  if (highRiskCount > 0) {
    const plural = highRiskCount === 1 ? "" : "s";
    return `⚠ ${highRiskCount} high-risk unexplained action${plural} — the agent went off-script`;
  }
  if (unexplained === 0) return "✓ 100% coverage — every observed action is explained";
  return `✓ No high-risk unexplained behaviour (${coveragePct}% coverage)`;
};

/** Format a triage report into the legible, risk-ranked {@link DemoView}. */
export const formatTriage = (report: TriageReport): DemoView => {
  const events = [...report.events].sort((a, b) => b.risk - a.risk).map(toFormatted);
  const highRiskCount = events.filter((e) => e.band === "HIGH").length;
  // No observed activity → nothing to explain; treat as full coverage.
  const coveragePct = report.total === 0 ? PERCENT : Math.round(report.coverage_ratio * PERCENT);
  return {
    coveragePct,
    summary: summarize(coveragePct, highRiskCount, report.unexplained),
    highRiskCount,
    events,
  };
};
