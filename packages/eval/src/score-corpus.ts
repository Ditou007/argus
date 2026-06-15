import { createSignalRegistry } from "@argus/api/correlation/signal-registry";
import { parseActionHints } from "@argus/api/correlation/action-parser";
import type { EventCandidate, ActionWindow } from "@argus/api/correlation/types";
import type { Corpus, CorpusAction, CorpusEvent } from "./corpus.js";

/** One (action, event) pair scored by the real engine, carrying the event's ground truth. */
export interface CorpusScore {
  readonly action_id: string;
  readonly action_type: string;
  readonly event_id: number;
  readonly confidence: number;
  readonly true_match: boolean;
  readonly uncertain: boolean;
}

const WINDOW_PAD_MS = 1000; // matches the correlator's ±1s candidate window
const NO_CORRELATION = 0;

const inWindow = (event: CorpusEvent, action: CorpusAction): boolean => {
  const t = (event.event_time ?? event.created_at).getTime();
  return (
    t >= action.started_at.getTime() - WINDOW_PAD_MS && t <= action.ended_at.getTime() + WINDOW_PAD_MS
  );
};

const toCandidate = (event: CorpusEvent): EventCandidate => ({
  id: event.id,
  event_type: event.event_type,
  process_pid: event.process_pid,
  process_binary: event.process_binary,
  function_name: event.function_name,
  event_time: event.event_time,
  created_at: event.created_at,
  raw_event: event.raw_event,
});

/**
 * Score every candidate event against each action whose window it falls in, using
 * the real engine (no DB, no DNS — resolved IPs come from the fixture). Pure and
 * deterministic; mirrors what the production correlator does, one action at a time.
 * @function scoreCorpus
 * @param corpus - The labelled corpus to score.
 * @returns One {@link CorpusScore} per (action, in-window event) pair.
 */
export const scoreCorpus = (corpus: Corpus): CorpusScore[] => {
  const registry = createSignalRegistry();
  const scores: CorpusScore[] = [];

  for (const action of corpus.actions) {
    const hints = {
      ...parseActionHints({
        action_type: action.action_type,
        action_name: action.action_name,
        input_summary: action.input_summary,
        agent_pid: action.agent_pid,
        pod_name: action.pod_name,
      }),
      expected_ips: action.expected_ips,
    };
    const window: ActionWindow = { started_at: action.started_at, ended_at: action.ended_at };

    for (const event of corpus.events) {
      if (!inWindow(event, action)) continue;
      const scored = registry.scoreEvent(toCandidate(event), window, hints);
      scores.push({
        action_id: action.id,
        action_type: action.action_type,
        event_id: event.id,
        confidence: scored?.confidence ?? NO_CORRELATION,
        true_match: event.true_action_id === action.id,
        uncertain: event.uncertain,
      });
    }
  }

  return scores;
};
