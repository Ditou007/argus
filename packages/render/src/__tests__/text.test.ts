import { describe, it, expect } from "vitest";
import { renderText } from "../text.js";
import type { DemoView } from "../format.js";

const view: DemoView = {
  coveragePct: 8,
  summary: "⚠ 2 high-risk unexplained actions — the agent went off-script",
  highRiskCount: 2,
  events: [
    {
      id: 1,
      band: "HIGH",
      risk: 1,
      sensitivity: "high",
      action: "Read credential file /root/.ssh/id_rsa",
      resource: "/root/.ssh/id_rsa",
      reason: "Unexplained — no declared action accounts for it",
    },
    {
      id: 2,
      band: "LOW",
      risk: 0.1,
      sensitivity: "low",
      action: "Wrote to file /tmp/x",
      resource: "/tmp/x",
      reason: "Unexplained — no declared action accounts for it",
    },
  ],
};

describe("renderText", () => {
  it("leads with the verdict summary and the high-risk count", () => {
    const out = renderText(view);
    expect(out).toContain(view.summary);
    expect(out).toMatch(/2 high-risk/);
    // does NOT headline the noise-inflated raw coverage %
    expect(out).not.toMatch(/coverage: 8%/i);
  });

  it("lists each event with its band and plain-language action", () => {
    const out = renderText(view);
    expect(out).toContain("HIGH");
    expect(out).toContain("Read credential file /root/.ssh/id_rsa");
    expect(out).toContain("Wrote to file /tmp/x");
  });

  it("renders a clean all-clear when there are no events", () => {
    const out = renderText({ coveragePct: 100, summary: "✓ 100% coverage — every observed action is explained", highRiskCount: 0, events: [] });
    expect(out).toContain("100% coverage");
  });
});
