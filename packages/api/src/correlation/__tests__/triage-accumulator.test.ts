import { describe, it, expect } from "vitest";
import { buildTriageReport, createTriageAccumulator, type TriageInputEvent } from "../triage.js";

const ev = (id: number, raw: Record<string, unknown>, over: Partial<TriageInputEvent> = {}): TriageInputEvent => ({
  id,
  event_type: "process_kprobe",
  function_name: "fd_install",
  process_binary: "agent",
  process_pid: 100,
  raw_event: raw,
  ...over,
});

const ssh = { process_kprobe: { args: [{ file_arg: { path: "/root/.ssh/id_rsa" } }] } };
const connect = (daddr: string) => ({ process_kprobe: { args: [{ sock_arg: { daddr, dport: 443 } }] } });

// A realistic mixed window: an explained fd_install whose fd a LATER unexplained
// write reuses (cross-event D14 resolution), plus explained + unexplained events.
const fdOpen = ev(30, { process_kprobe: { args: [{ intArg: 3 }, { fileArg: { path: "/root/.ssh/id_rsa" } }] } });
const exfilWrite = ev(31, { process_kprobe: { args: [{ intArg: 3 }, { sizeArg: "9" }] } }, { function_name: "__arm64_sys_write" });
const events: TriageInputEvent[] = [
  fdOpen, // explained
  ev(1, {}), // explained, no resource
  ev(2, connect("203.0.113.5"), { function_name: "tcp_connect" }), // unexplained, undeclared egress → high
  ev(3, connect("1.1.1.1"), { function_name: "tcp_connect" }), // unexplained, declared → low
  exfilWrite, // unexplained write, resolves to the ssh key via fd 3
  ev(4, ssh, { function_name: "fd_install" }), // unexplained ssh read → high
];

const threshold = 0.5;
const bestConfidence = new Map<number, number>([[30, 0.9], [1, 0.8]]); // 30 and 1 explained; rest unexplained
const declaredDestinations = ["1.1.1.1"];

const batchReport = () =>
  buildTriageReport({
    allEvents: events,
    unexplainedIds: new Set(events.map((e) => e.id).filter((id) => (bestConfidence.get(id) ?? 0) < threshold)),
    bestConfidence,
    declaredDestinations,
  });

const streamReport = (chunkSize: number) => {
  const acc = createTriageAccumulator({ bestConfidence, threshold, declaredDestinations });
  for (let i = 0; i < events.length; i += chunkSize) {
    for (const e of events.slice(i, i + chunkSize)) acc.push(e);
  }
  return acc.report();
};

describe("createTriageAccumulator — equivalence to buildTriageReport (accuracy guard)", () => {
  it("produces a byte-for-byte identical report when fed whole", () => {
    expect(streamReport(events.length)).toEqual(batchReport());
  });

  it("is identical regardless of chunk size — incl. fd_install and its write split across chunks", () => {
    // chunkSize 1 forces fd_install (id 30) and its write (id 31) into separate
    // pushes: the fd→path table must carry across the boundary, exactly as the
    // batch single-pass does.
    const expected = batchReport();
    for (const size of [1, 2, 3, 5]) {
      expect(streamReport(size)).toEqual(expected);
    }
  });

  it("still resolves the exfil write to the ssh key and flags it high (the moat must hold)", () => {
    const r = streamReport(1);
    const write = r.events.find((e) => e.id === 31);
    expect(write?.resource).toEqual({ kind: "file", path: "/root/.ssh/id_rsa" });
    expect(write?.sensitivity).toBe("high");
    expect(r.risk_score).toBe(1);
    expect(r.total).toBe(events.length);
  });
});
