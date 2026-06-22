const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface StoredEvent {
  id: number;
  event_type: string;
  process_binary: string | null;
  process_pid: number | null;
  function_name: string | null;
  raw_event: Record<string, unknown>;
  created_at: string;
}

export interface EventsResponse {
  events: StoredEvent[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export interface StatEntry {
  event_type: string;
  count: string;
}

export interface StatsResponse {
  stats: StatEntry[];
  total: number;
}

export interface HealthResponse {
  status: "healthy" | "unhealthy";
  service: string;
  db: string;
}

export interface EventFilters {
  type?: string;
  binary?: string;
  limit?: number;
  offset?: number;
}

export interface AgentSession {
  id: string;
  agent_name: string;
  agent_pid: number;
  host_name: string | null;
  metadata: Record<string, unknown>;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  action_count?: number;
  event_count?: number;
}

export interface AgentAction {
  id: string;
  session_id: string;
  action_type: string;
  action_name: string | null;
  input_summary: string | null;
  output_summary: string | null;
  metadata: Record<string, unknown>;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  events_correlated?: number;
}

export interface TimelineEntry {
  action: AgentAction;
  events: StoredEvent[];
}

const fetchApi = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
};

/**
 * Fetch the API health status.
 * @function fetchHealth
 * @returns the health response
 */
export const fetchHealth = () =>
  fetchApi<HealthResponse>("/api/health");

/**
 * Fetch captured events, optionally filtered.
 * @function fetchEvents
 * @param filters - optional type/binary/limit/offset filters
 * @returns the paginated events response
 */
export const fetchEvents = (filters: EventFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.binary) params.set("binary", filters.binary);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const qs = params.toString();
  return fetchApi<EventsResponse>(`/api/events${qs ? `?${qs}` : ""}`);
};

/**
 * Fetch event-type counts.
 * @function fetchStats
 * @returns the stats response
 */
export const fetchStats = () =>
  fetchApi<StatsResponse>("/api/events/stats");

/**
 * Fetch the list of agent sessions.
 * @function fetchSessions
 * @returns the sessions list
 */
export const fetchSessions = () =>
  fetchApi<{ sessions: AgentSession[] }>("/api/sessions");

/**
 * Fetch a single session by id.
 * @function fetchSession
 * @param id - the session id
 * @returns the session
 */
export const fetchSession = (id: string) =>
  fetchApi<{ session: AgentSession }>(`/api/sessions/${id}`);

/**
 * Fetch a session's timeline (actions + correlated events).
 * @function fetchSessionTimeline
 * @param id - the session id
 * @returns the session + timeline
 */
export const fetchSessionTimeline = (id: string) =>
  fetchApi<{ session: AgentSession; timeline: TimelineEntry[] }>(`/api/sessions/${id}/timeline`);

// One row of the ClickHouse-backed correlated trace (SPEC_04 forensic replay).
export interface TraceEvent {
  session_id: string;
  action_id: string;
  action_type: string;
  process_pid: number;
  process_binary: string;
  function_name: string;
  event_time: string;
  confidence: number;
  method: string;
  signal_scores: string; // JSON string
  reasons: string; // JSON string
}

export interface TraceResponse {
  session_id: string;
  count: number;
  events: TraceEvent[];
}

/**
 * Fetch a session's ClickHouse-backed correlated trace (SPEC_04 forensic replay).
 * @function fetchSessionTrace
 * @param id - the session id
 * @returns the trace response (declared actions + attributed events + verdict)
 */
export const fetchSessionTrace = (id: string) =>
  fetchApi<TraceResponse>(`/api/sessions/${id}/trace`);

/**
 * Format a timestamp as a relative "time ago" string.
 * @function formatTimeAgo
 * @param dateStr - an ISO timestamp
 * @returns a human-readable relative time
 */
export const formatTimeAgo = (dateStr: string): string => {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};
