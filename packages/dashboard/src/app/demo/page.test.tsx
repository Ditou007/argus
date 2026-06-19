import { describe, it, expect, vi } from "vitest";

// Offline: no session yet, no live stream — the page should still render both panels.
vi.mock("@/lib/agent-client", () => ({
  latestSessionId: vi.fn(async () => null),
  fetchTriage: vi.fn(async () => null),
  sendChat: vi.fn(async () => ({ reply: "", runs: [] })),
}));
vi.mock("@/hooks/use-live-stream", () => ({
  useLiveStream: () => ({ connected: false }),
}));

import { render, screen } from "@testing-library/react";
import DemoPage from "./page.js";

describe("DemoPage", () => {
  it("renders the chat panel and the live Argus panel", () => {
    render(<DemoPage />);
    expect(screen.getByText(/chatbot agent/i)).toBeTruthy();
    expect(screen.getByText(/argus · live detection/i)).toBeTruthy();
    expect(screen.getByText(/waiting for the agent session/i)).toBeTruthy();
  });
});
