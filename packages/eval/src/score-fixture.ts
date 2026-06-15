import { createSignalRegistry } from "@argus/api/correlation/signal-registry";
import { parseActionHints } from "@argus/api/correlation/action-parser";
import type { EventCandidate, ActionWindow } from "@argus/api/correlation/types";
import type { Fixture } from "./fixture.js";

/** One fixture event scored by the real engine, with its ground-truth label retained. */
export interface ScoredFixtureEvent {
  readonly event_id: number;
  readonly confidence: number;
  readonly true_match: boolean;
}

// An event the engine discards (below its internal threshold) contributes no
// correlation, which the harness treats as confidence 0.
const NO_CORRELATION = 0;

/**
 * Run a fixture through the production scoring core with zero I/O: no DB query,
 * no DNS — resolved IPs are injected from the fixture. Pure and deterministic,
 * so the same fixture always yields the same scores.
 */
export const scoreFixture = (fixture: Fixture): ScoredFixtureEvent[] => {
  const registry = createSignalRegistry();
  const hints = parseActionHints({
    action_type: fixture.action.action_type,
    action_name: fixture.action.action_name,
    input_summary: fixture.action.input_summary,
    agent_pid: fixture.action.agent_pid,
    pod_name: fixture.action.pod_name,
  });
  // Mirror the correlator's post-DNS step deterministically.
  const resolvedHints = { ...hints, expected_ips: fixture.action.expected_ips };
  const actionWindow: ActionWindow = {
    started_at: fixture.action.started_at,
    ended_at: fixture.action.ended_at,
  };

  return fixture.events.map((event) => {
    const candidate: EventCandidate = {
      id: event.id,
      event_type: event.event_type,
      process_pid: event.process_pid,
      process_binary: event.process_binary,
      function_name: event.function_name,
      event_time: event.event_time,
      created_at: event.created_at,
      raw_event: event.raw_event,
    };
    const scored = registry.scoreEvent(candidate, actionWindow, resolvedHints);
    return {
      event_id: event.id,
      confidence: scored?.confidence ?? NO_CORRELATION,
      true_match: event.true_match,
    };
  });
};
