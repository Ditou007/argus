import { describe, it, expect } from "vitest";
import { parseCorpus } from "./corpus.js";
import { scoreCorpus } from "./score-corpus.js";

const corpus = parseCorpus({
  name: "t",
  pod_name: "pod",
  agent_pid: 1,
  actions: [
    {
      id: "llm",
      action_type: "llm_call",
      action_name: "groq.chat",
      input_summary: "POST https://api.groq.com/openai/v1/chat/completions",
      started_at: "2026-06-14T00:00:00.000Z",
      ended_at: "2026-06-14T00:00:00.100Z",
      agent_pid: 1,
      pod_name: "pod",
      expected_ips: ["172.64.149.20"],
    },
  ],
  events: [
    {
      id: 1,
      event_type: "process_kprobe",
      process_pid: 1,
      function_name: "tcp_connect",
      event_time: "2026-06-14T00:00:00.050Z",
      created_at: "2026-06-14T00:00:00.050Z",
      raw_event: { process_kprobe: { process: { pid: 1 }, args: [{ sockArg: { daddr: "172.64.149.20", dport: 443 } }] } },
      true_action_id: "llm",
    },
    {
      id: 2,
      event_type: "process_kprobe",
      process_pid: 1,
      function_name: "fd_install",
      event_time: "2026-06-14T00:00:00.050Z",
      created_at: "2026-06-14T00:00:00.050Z",
      raw_event: { process_kprobe: { process: { pid: 1 }, args: [{ fileArg: { path: "/tmp/noise" } }] } },
      true_action_id: null,
    },
  ],
});

describe("scoreCorpus", () => {
  it("scores each in-window (action,event) pair and carries the truth flag", () => {
    const scores = scoreCorpus(corpus);
    expect(scores).toHaveLength(2);
    const m = new Map(scores.map((s) => [s.event_id, s]));
    expect(m.get(1)?.true_match).toBe(true);
    expect(m.get(1)?.confidence).toBeGreaterThan(0.7); // matched on IP + PID + time + function
    expect(m.get(2)?.true_match).toBe(false);
  });

  it("is deterministic", () => {
    expect(scoreCorpus(corpus)).toEqual(scoreCorpus(corpus));
  });
});
