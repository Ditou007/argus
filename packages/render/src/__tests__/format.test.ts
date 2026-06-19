import { describe, it, expect } from "vitest";
import { formatTriage } from "../format.js";
import type { TriageReport, TriageFeedEvent } from "../format.js";

const ev = (over: Partial<TriageFeedEvent>): TriageFeedEvent => ({
  id: 1,
  event_type: "process_kprobe",
  function_name: "fd_install",
  process_binary: "/usr/local/bin/node",
  resource: { kind: "file", path: "/tmp/x" },
  best_confidence: 0,
  sensitivity: "low",
  risk: 0.1,
  ...over,
});

const report = (events: TriageFeedEvent[], over: Partial<TriageReport> = {}): TriageReport => ({
  total: 100,
  explained: 40,
  unexplained: events.length,
  coverage_ratio: 0.4,
  risk_score: Math.max(0, ...events.map((e) => e.risk)),
  events,
  ...over,
});

describe("formatTriage", () => {
  it("ranks a HIGH ~/.ssh read above a LOW /tmp write", () => {
    const sshRead = ev({
      id: 2,
      function_name: "fd_install",
      resource: { kind: "file", path: "/root/.ssh/id_rsa" },
      sensitivity: "high",
      risk: 1.0,
    });
    const tmpWrite = ev({ id: 3, function_name: "sys_write", resource: { kind: "file", path: "/tmp/scratch" }, risk: 0.1 });
    const view = formatTriage(report([tmpWrite, sshRead]));
    expect(view.events[0]?.id).toBe(2); // ssh first despite input order
    expect(view.events[0]?.band).toBe("HIGH");
    expect(view.events[1]?.band).toBe("LOW");
  });

  it("renders zero unexplained as 100% coverage", () => {
    const view = formatTriage(report([], { total: 50, explained: 50, unexplained: 0, coverage_ratio: 1, risk_score: 0 }));
    expect(view.coveragePct).toBe(100);
    expect(view.summary).toMatch(/100% coverage/i);
    expect(view.highRiskCount).toBe(0);
  });

  it("describes a credential read in plain language", () => {
    const view = formatTriage(report([ev({ resource: { kind: "file", path: "/root/.ssh/id_rsa" }, sensitivity: "high", risk: 1 })]));
    expect(view.events[0]?.action).toMatch(/credential/i);
    expect(view.events[0]?.action).toContain("/root/.ssh/id_rsa");
  });

  it("describes a network exfil connect in plain language", () => {
    const conn = ev({ function_name: "tcp_connect", resource: { kind: "network", daddr: "1.1.1.1", dport: 443 }, sensitivity: "high", risk: 1 });
    const view = formatTriage(report([conn]));
    expect(view.events[0]?.action).toMatch(/connect/i);
    expect(view.events[0]?.resource).toBe("1.1.1.1:443");
  });

  it("headlines the high-risk count when the agent goes off-script", () => {
    const a = ev({ id: 10, resource: { kind: "file", path: "/root/.ssh/id_rsa" }, sensitivity: "high", risk: 1 });
    const b = ev({ id: 11, function_name: "tcp_connect", resource: { kind: "network", daddr: "1.1.1.1", dport: 443 }, sensitivity: "high", risk: 0.9 });
    const view = formatTriage(report([a, b]));
    expect(view.highRiskCount).toBe(2);
    expect(view.summary).toMatch(/2 high-risk/i);
  });

  it("explains why an orphan event is flagged", () => {
    const view = formatTriage(report([ev({ best_confidence: 0, resource: { kind: "file", path: "/root/.ssh/id_rsa" }, sensitivity: "high", risk: 1 })]));
    expect(view.events[0]?.reason).toMatch(/no declared action/i);
  });
});
