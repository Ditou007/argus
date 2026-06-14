import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Curate a labelled evaluation corpus from a raw kind+Tetragon capture.
 *
 * The ground-truth rule is **intent-based and engine-independent**: an event is a
 * `match` for an action only if it realizes that action's described intent. SDK→
 * argus-api traffic, interpreter reads, and pathless writes are `noise`; the
 * overlapping GitHub/httpbin CDN connects are `uncertain` (excluded from metrics).
 * See `fixtures/README.md` for the full procedure.
 */

const ARGUS_API_IP = "10.96.247.55"; // the SDK reporting its own actions — instrumentation noise
const GROQ_IP = "172.64.149.20"; // Groq behind Cloudflare (the one external dest in the llm window)
const NOISE_PER_ACTION = 8; // cap on sampled noise events per action, to keep the fixture reviewable
const WINDOW_PAD_MS = 1000; // matches the correlator's ±1s candidate window
const READ_PATHS = ["/etc/hostname", "/etc/os-release", "/etc/resolv.conf"];

export interface RawAction {
  id: string;
  action_type: string;
  action_name: string | null;
  input_summary: string | null;
  started_at: string;
  ended_at: string;
  agent_pid: number;
  pod_name: string | null;
}

export interface RawEvent {
  id: number;
  event_type: string;
  process_pid: number;
  process_binary: string | null;
  function_name: string | null;
  event_time: string | null;
  created_at: string;
  raw_event: Record<string, unknown>;
}

export type Verdict = "match" | "uncertain" | "noise";

const kprobeArgs = (ev: RawEvent): Array<Record<string, unknown>> => {
  const k = (ev.raw_event.process_kprobe ?? ev.raw_event.processKprobe) as
    | Record<string, unknown>
    | undefined;
  return (k?.args as Array<Record<string, unknown>>) ?? [];
};

const filePathOf = (ev: RawEvent): string | null => {
  for (const a of kprobeArgs(ev)) {
    const f = (a.fileArg ?? a.file_arg) as { path?: string } | string | undefined;
    if (typeof f === "string") return f;
    if (f?.path) return f.path;
  }
  return null;
};

const destOf = (ev: RawEvent): string | null => {
  for (const a of kprobeArgs(ev)) {
    const s = (a.sockArg ?? a.sock_arg) as { daddr?: string } | undefined;
    if (s?.daddr) return s.daddr;
  }
  return null;
};

const isNet = (ev: RawEvent): boolean =>
  ev.function_name === "tcp_connect" || ev.function_name === "tcp_sendmsg";

const isExternal = (ip: string | null): ip is string =>
  !!ip &&
  !ip.startsWith("10.") &&
  !ip.startsWith("172.16.") &&
  !ip.startsWith("192.168.") &&
  ip !== "127.0.0.1";

// One intent rule per action_name. Keeping these as a table (rather than a switch)
// keeps each rule trivially simple and the dispatcher complexity-free.
const RULES: Record<string, (ev: RawEvent) => Verdict> = {
  read_system_info: (ev) =>
    ev.function_name === "fd_install" && READ_PATHS.includes(filePathOf(ev) ?? "") ? "match" : "noise",
  system_commands: (ev) =>
    ev.event_type === "process_exec" || ev.event_type === "process_exit" ? "match" : "noise",
  "groq.chat": (ev) => (isNet(ev) && destOf(ev) === GROQ_IP ? "match" : "noise"),
  write_report: (ev) =>
    ev.function_name === "fd_install" && filePathOf(ev) === "/tmp/argus-research/security-report.json"
      ? "match"
      : "noise",
  write_summary: (ev) =>
    ev.function_name === "fd_install" && filePathOf(ev) === "/tmp/argus-research/summary.txt"
      ? "match"
      : "noise",
  github_api: (ev) => (isNet(ev) && isExternal(destOf(ev)) && destOf(ev) !== ARGUS_API_IP ? "uncertain" : "noise"),
  httpbin_ip: (ev) => (isNet(ev) && isExternal(destOf(ev)) && destOf(ev) !== ARGUS_API_IP ? "uncertain" : "noise"),
};

/**
 * Classify one event against one action by the intent rule.
 * @function classifyEvent
 * @param ev - The captured event.
 * @param action - The agent action to test it against.
 * @returns "match" if the event realizes the action's intent, "uncertain" if ambiguous, else "noise".
 */
export const classifyEvent = (ev: RawEvent, action: RawAction): Verdict =>
  (RULES[action.action_name ?? ""] ?? (() => "noise" as const))(ev);

const inWindow = (ev: RawEvent, action: RawAction): boolean => {
  const t = new Date(ev.event_time ?? ev.created_at).getTime();
  return (
    t >= new Date(action.started_at).getTime() - WINDOW_PAD_MS &&
    t <= new Date(action.ended_at).getTime() + WINDOW_PAD_MS
  );
};

const toEvent = (ev: RawEvent, trueActionId: string | null, uncertain: boolean) => ({
  id: ev.id,
  event_type: ev.event_type,
  process_pid: ev.process_pid,
  process_binary: ev.process_binary ?? null,
  function_name: ev.function_name,
  event_time: ev.event_time,
  created_at: ev.created_at,
  raw_event: ev.raw_event,
  true_action_id: trueActionId,
  uncertain,
});

interface Selection {
  picked: Map<number, ReturnType<typeof toEvent>>;
  noiseCount: Map<string, number>;
}

// Record one (event, action, verdict) into the running selection. A match always
// wins (and overwrites a prior noise/uncertain pick); noise is capped per action.
const recordVerdict = (verdict: Verdict, ev: RawEvent, action: RawAction, sel: Selection): void => {
  if (verdict === "match") {
    sel.picked.set(ev.id, toEvent(ev, action.id, false));
    return;
  }
  if (sel.picked.has(ev.id)) return;
  if (verdict === "uncertain") {
    sel.picked.set(ev.id, toEvent(ev, null, true));
    return;
  }
  const n = sel.noiseCount.get(action.id) ?? 0;
  if (n < NOISE_PER_ACTION) {
    sel.picked.set(ev.id, toEvent(ev, null, false));
    sel.noiseCount.set(action.id, n + 1);
  }
};

/**
 * Build the labelled corpus from raw actions + events (pure; no I/O).
 * @function curate
 * @param actions - The agent actions from the capture.
 * @param events - The captured kernel events to label and select.
 * @returns A schema-valid corpus object (string timestamps, ready to serialise).
 */
export const curate = (actions: RawAction[], events: RawEvent[]) => {
  const sel: Selection = { picked: new Map(), noiseCount: new Map() };

  for (const action of actions) {
    for (const ev of events) {
      if (inWindow(ev, action)) recordVerdict(classifyEvent(ev, action), ev, action, sel);
    }
  }
  const picked = sel.picked;

  return {
    name: "real_security_researcher",
    description:
      "Real kind+Tetragon capture of real_agent.py (security-researcher) on arm64. Intent-labelled: " +
      "true matches realize the action's described behavior; SDK->argus-api traffic, interpreter reads " +
      "and pathless writes are noise; overlapping CDN connects are uncertain (excluded from metrics).",
    source: "k8s real-agent-job.yaml run, 2026-06-14; curated by src/curate.ts",
    pod_name: actions[0]?.pod_name ?? null,
    agent_pid: actions[0]?.agent_pid ?? 0,
    actions: actions.map((a) => ({
      id: a.id,
      action_type: a.action_type,
      action_name: a.action_name,
      input_summary: a.input_summary,
      started_at: a.started_at,
      ended_at: a.ended_at,
      agent_pid: a.agent_pid,
      pod_name: a.pod_name,
      expected_ips: a.action_name === "groq.chat" ? [GROQ_IP] : [],
    })),
    events: [...picked.values()].sort((x, y) => x.id - y.id),
  };
};

const main = (): void => {
  const raw = (name: string): unknown =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/raw/${name}.json`, import.meta.url)), "utf8"));
  const corpus = curate(raw("actions") as RawAction[], raw("events") as RawEvent[]);
  const out = fileURLToPath(new URL("../fixtures/corpus-real.json", import.meta.url));
  writeFileSync(out, `${JSON.stringify(corpus, null, 2)}\n`);
  const matches = corpus.events.filter((e) => e.true_action_id !== null).length;
  const uncertain = corpus.events.filter((e) => e.uncertain).length;
  process.stdout.write(
    `wrote ${corpus.events.length} events (${matches} match, ${uncertain} uncertain, ` +
      `${corpus.events.length - matches - uncertain} noise) across ${corpus.actions.length} actions\n`
  );
};

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) main();
