import { describe, it, expect } from "vitest";
import { buildTriageReport, type TriageInputEvent } from "../triage.js";

const ev = (id: number, raw: Record<string, unknown>): TriageInputEvent => ({
  id,
  event_type: "process_kprobe",
  function_name: "fd_install",
  process_binary: "agent",
  raw_event: raw,
});

const ssh = { process_kprobe: { args: [{ file_arg: { path: "/root/.ssh/id_rsa" } }] } };
const tmp = { process_kprobe: { args: [{ file_arg: { path: "/tmp/x" } }] } };
const connect = (daddr: string) => ({ process_kprobe: { args: [{ sock_arg: { daddr, dport: 443 } }] } });

describe("buildTriageReport", () => {
  it("computes coverage from explained vs total", () => {
    const all = [ev(1, {}), ev(2, {}), ev(3, ssh)];
    const r = buildTriageReport({
      allEvents: all,
      unexplainedIds: new Set([3]),
      bestConfidence: new Map([[1, 0.9], [2, 0.8]]),
      declaredDestinations: [],
    });
    expect(r.total).toBe(3);
    expect(r.explained).toBe(2);
    expect(r.unexplained).toBe(1);
    expect(r.coverage_ratio).toBeCloseTo(2 / 3);
  });

  it("ranks unexplained events by risk and reports the worst as risk_score", () => {
    const all = [ev(10, tmp), ev(11, ssh)];
    const r = buildTriageReport({
      allEvents: all,
      unexplainedIds: new Set([10, 11]),
      bestConfidence: new Map(),
      declaredDestinations: [],
    });
    expect(r.events.map((e) => e.id)).toEqual([11, 10]); // ssh (high) before tmp (low)
    expect(r.events[0].sensitivity).toBe("high");
    expect(r.risk_score).toBe(1);
  });

  it("treats a declared destination as low-risk, an undeclared one as high", () => {
    const all = [ev(20, connect("1.1.1.1")), ev(21, connect("203.0.113.5"))];
    const r = buildTriageReport({
      allEvents: all,
      unexplainedIds: new Set([20, 21]),
      bestConfidence: new Map(),
      declaredDestinations: ["1.1.1.1"],
    });
    const byId = Object.fromEntries(r.events.map((e) => [e.id, e.sensitivity]));
    expect(byId[20]).toBe("low"); // declared
    expect(byId[21]).toBe("high"); // undeclared
  });

  it("a zero-event session is fully covered with an empty feed", () => {
    const r = buildTriageReport({
      allEvents: [],
      unexplainedIds: new Set(),
      bestConfidence: new Map(),
      declaredDestinations: [],
    });
    expect(r.coverage_ratio).toBe(1);
    expect(r.risk_score).toBe(0);
    expect(r.events).toEqual([]);
  });
});
