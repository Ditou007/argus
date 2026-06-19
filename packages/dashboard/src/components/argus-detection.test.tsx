import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArgusDetection } from "./argus-detection.js";
import type { DemoView } from "@argus/render";

const attackView: DemoView = {
  coveragePct: 1,
  summary: "⚠ 1 high-risk unexplained action — the agent went off-script",
  highRiskCount: 1,
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
  ],
};

describe("ArgusDetection", () => {
  it("shows a waiting state before a session/view exists", () => {
    render(<ArgusDetection view={null} connected={false} />);
    expect(screen.getByText(/waiting for the agent session/i)).toBeTruthy();
  });

  it("renders the verdict summary and the HIGH attack event", () => {
    render(<ArgusDetection view={attackView} connected={true} />);
    expect(screen.getByText(/went off-script/i)).toBeTruthy();
    expect(screen.getByText("Read credential file /root/.ssh/id_rsa")).toBeTruthy();
    expect(screen.getByText("HIGH")).toBeTruthy();
  });

  it("renders an all-clear with no events", () => {
    render(
      <ArgusDetection
        view={{ coveragePct: 100, summary: "✓ 100% coverage — every observed action is explained", highRiskCount: 0, events: [] }}
        connected={true}
      />
    );
    expect(screen.getByText(/no unexplained behaviour/i)).toBeTruthy();
  });
});
