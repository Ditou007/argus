import { describe, it, expect } from "vitest";
import { classifyEvent, curate, type RawAction, type RawEvent } from "../curate.js";
import { parseCorpus } from "../corpus.js";

const action = (over: Partial<RawAction>): RawAction => ({
  id: "act-1",
  action_type: "llm_call",
  action_name: "groq.chat",
  input_summary: null,
  started_at: "2026-06-14T00:00:00.000Z",
  ended_at: "2026-06-14T00:00:00.100Z",
  agent_pid: 1,
  pod_name: "pod",
  ...over,
});

const netEvent = (id: number, daddr: string): RawEvent => ({
  id,
  event_type: "process_kprobe",
  process_pid: 100,
  process_binary: "/usr/local/bin/python",
  function_name: "tcp_sendmsg",
  event_time: "2026-06-14T00:00:00.050Z",
  created_at: "2026-06-14T00:00:00.050Z",
  raw_event: { process_kprobe: { args: [{ sockArg: { daddr, dport: 443 } }] } },
});

const fileEvent = (id: number, path: string): RawEvent => ({
  id,
  event_type: "process_kprobe",
  process_pid: 100,
  process_binary: "/usr/local/bin/python",
  function_name: "fd_install",
  event_time: "2026-06-14T00:00:00.050Z",
  created_at: "2026-06-14T00:00:00.050Z",
  raw_event: { process_kprobe: { args: [{ fileArg: { path } }] } },
});

describe("classifyEvent (intent rule)", () => {
  it("matches a Groq sendmsg, ignores the SDK→argus-api traffic", () => {
    expect(classifyEvent(netEvent(1, "172.64.149.20"), action({}))).toBe("match");
    expect(classifyEvent(netEvent(2, "10.96.247.55"), action({}))).toBe("noise");
  });

  it("marks an external GitHub/httpbin connect uncertain", () => {
    const a = action({ action_name: "github_api", action_type: "network_request" });
    expect(classifyEvent(netEvent(3, "20.207.73.85"), a)).toBe("uncertain");
    expect(classifyEvent(netEvent(4, "10.96.247.55"), a)).toBe("noise");
  });

  it("matches a file action only on its exact named path", () => {
    const a = action({ action_name: "write_report", action_type: "file_write" });
    expect(classifyEvent(fileEvent(5, "/tmp/argus-research/security-report.json"), a)).toBe("match");
    expect(classifyEvent(fileEvent(6, "/etc/hosts"), a)).toBe("noise");
  });

  it("defaults to noise for an unknown action", () => {
    expect(classifyEvent(netEvent(7, "172.64.149.20"), action({ action_name: "mystery" }))).toBe("noise");
  });
});

describe("curate", () => {
  it("produces a schema-valid corpus with the expected label counts", () => {
    const actions = [action({ id: "llm", action_name: "groq.chat" })];
    const events = [
      netEvent(1, "172.64.149.20"), // match
      netEvent(2, "10.96.247.55"), // noise (SDK)
      fileEvent(3, "/usr/lib/python/foo.py"), // noise
    ];
    const corpus = parseCorpus(curate(actions, events));
    expect(corpus.events).toHaveLength(3);
    expect(corpus.events.filter((e) => e.true_action_id === "llm")).toHaveLength(1);
    expect(corpus.events.filter((e) => e.true_action_id === null && !e.uncertain)).toHaveLength(2);
  });
});
