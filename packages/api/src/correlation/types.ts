// What the action parser extracts from agent-reported fields
export interface ActionHints {
  action_type: string;
  action_name: string | null;
  expected_hostnames: string[];
  expected_ips: string[];
  expected_ports: number[];
  expected_file_paths: string[];
  expected_functions: string[];
  agent_pid: number;
  pod_name: string | null;
}

// A single event candidate from the database
export interface EventCandidate {
  id: number;
  event_type: string;
  process_pid: number;
  process_binary: string | null;
  function_name: string | null;
  event_time: Date | null;
  created_at: Date;
  raw_event: Record<string, unknown>;
}

// The time window of the action
export interface ActionWindow {
  started_at: Date;
  ended_at: Date;
}

// Result from a single signal matcher
export interface SignalResult {
  signal_name: string;
  score: number;    // 0.0 to 1.0
  weight: number;   // 0 = opt out
  reason: string;
}

// A signal matcher function
export type SignalMatcher = (
  event: EventCandidate,
  action: ActionWindow,
  hints: ActionHints
) => SignalResult;

// Final scored correlation for one event
export interface ScoredCorrelation {
  event_id: number;
  confidence: number;
  method: string;
  signal_scores: Record<string, number>;
  reasons: string[];
}

// Summary returned from the correlator
export interface CorrelationResult {
  action_id: string;
  events_correlated: number;
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  method: string;
  top_signals: string[];
}
