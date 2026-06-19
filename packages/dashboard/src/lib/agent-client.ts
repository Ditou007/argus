import type { TriageReport } from "@argus/render";

/**
 * Data layer for the demo page: talk to the chatbot agent and the Argus triage
 * API. `fetch` is injectable so the orchestration is unit-testable offline.
 */

const AGENT_BASE = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:4001";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** One tool the agent invoked, with the guardrail verdict (sanctioned = declared). */
export interface ToolRun {
  readonly call: { readonly tool: string; readonly args: Readonly<Record<string, string>> };
  readonly sanctioned: boolean;
  readonly reason: string;
  readonly output: string;
}

/** The agent's reply to one chat turn plus what its tool calls did. */
export interface ChatResponse {
  readonly reply: string;
  readonly runs: readonly ToolRun[];
}

/** Send a chat message to the agent; throws on a non-2xx response. */
export const sendChat = async (message: string, fetchFn: typeof fetch = fetch): Promise<ChatResponse> => {
  const res = await fetchFn(`${AGENT_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`agent responded ${res.status}`);
  return (await res.json()) as ChatResponse;
};

/**
 * The newest session's id (the running agent's), or null if there are none —
 * including when the API is unreachable (transport reject), which is the normal
 * "agent not up yet" startup state the page retries through. Never throws.
 */
export const latestSessionId = async (fetchFn: typeof fetch = fetch): Promise<string | null> => {
  try {
    const res = await fetchFn(`${API_BASE}/api/sessions`);
    if (!res.ok) return null;
    const body = (await res.json()) as { sessions?: { id: string | number }[] };
    const first = body.sessions?.[0];
    return first ? String(first.id) : null;
  } catch {
    return null; // API not reachable yet — caller retries
  }
};

/**
 * A session's triage report, or null on any failure (HTTP error OR transport
 * reject). Returning null leaves the view unchanged — never a fabricated
 * all-clear, and never an unhandled rejection in the poll loop.
 */
export const fetchTriage = async (sessionId: string, fetchFn: typeof fetch = fetch): Promise<TriageReport | null> => {
  try {
    const res = await fetchFn(`${API_BASE}/api/sessions/${sessionId}/unexplained`);
    if (!res.ok) return null;
    return (await res.json()) as TriageReport;
  } catch {
    return null;
  }
};
