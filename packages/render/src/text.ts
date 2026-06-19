import type { DemoView } from "./format.js";

/** Pure text rendering of a {@link DemoView} for the `pnpm demo` CLI / headless use. */

const HEADER = "── Argus live detection ──────────────────────────────";

/**
 * Render the legible view as a plain-text report (no colour, CI-safe). Leads
 * with the verdict (summary), then the risk-ranked feed. It deliberately does
 * NOT headline the raw coverage % — that ratio counts low-risk runtime noise,
 * so it would mislead next to a clean verdict; the meaningful signal is the
 * high-risk count and the ranked feed.
 */
export const renderText = (view: DemoView): string => {
  const lines: string[] = [HEADER, view.summary, ""];
  if (view.events.length === 0) {
    lines.push("  (no unexplained behaviour)");
    return lines.join("\n");
  }
  for (const e of view.events) {
    lines.push(`  [${e.band}] ${e.action}`);
    lines.push(`         ${e.reason}`);
  }
  lines.push("", `  ${view.events.length} unexplained event(s) · ${view.highRiskCount} high-risk`);
  return lines.join("\n");
};
