import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CorrelatedTrace } from "./correlated-trace.js";
import type { TraceEvent } from "../lib/api.js";

const rows: TraceEvent[] = [
  {
    session_id: "s1",
    action_id: "a1",
    action_type: "network_request",
    process_pid: 100,
    process_binary: "/usr/bin/curl",
    function_name: "tcp_connect",
    event_time: "2026-06-22T00:00:05Z",
    confidence: 0.93,
    method: "network_destination",
    signal_scores: '{"network_destination":0.93}',
    reasons: '["dst 1.1.1.1 matches expected egress"]',
  },
];

describe("CorrelatedTrace", () => {
  it("shows an empty state when there are no attributed events", () => {
    render(<CorrelatedTrace events={[]} />);
    expect(screen.getByText(/no correlated trace/i)).toBeTruthy();
  });

  it("renders the declared action, its attributed event, and the confidence", () => {
    render(<CorrelatedTrace events={rows} />);
    expect(screen.getByText(/network_request/)).toBeTruthy();
    expect(screen.getByText(/tcp_connect/)).toBeTruthy();
    expect(screen.getByText(/\/usr\/bin\/curl/)).toBeTruthy();
    expect(screen.getByText(/93%/)).toBeTruthy();
  });

  it("surfaces the forensic reason narrative", () => {
    render(<CorrelatedTrace events={rows} />);
    expect(screen.getByText(/matches expected egress/)).toBeTruthy();
  });
});
