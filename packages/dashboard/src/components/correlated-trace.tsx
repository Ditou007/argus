import type { TraceEvent } from "../lib/api.js";

const groupByAction = (events: TraceEvent[]): [string, TraceEvent[]][] => {
  const groups = new Map<string, TraceEvent[]>();
  for (const event of events) {
    const list = groups.get(event.action_id) ?? [];
    list.push(event);
    groups.set(event.action_id, list);
  }
  return [...groups.entries()];
};

const parseReasons = (reasons: string): string[] => {
  try {
    const parsed = JSON.parse(reasons);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * Render a session's ClickHouse-backed correlated trace for audit/replay:
 * each declared action with the syscalls attributed to it, their confidence,
 * and the per-signal reason narrative (SPEC_04 forensic replay surface).
 * @function CorrelatedTrace
 * @param props - the component props
 * @param props.events - the correlated-trace rows from GET /api/sessions/:id/trace
 * @returns the rendered trace, or an empty-state message
 */
export function CorrelatedTrace({ events }: { events: TraceEvent[] }) {
  if (events.length === 0) {
    return (
      <p style={{ fontSize: "0.8125rem", color: "#737373" }}>
        No correlated trace yet — declared actions and their attributed syscalls will appear here.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {groupByAction(events).map(([actionId, group]) => (
        <div
          key={actionId}
          style={{ border: "1px solid #262626", borderRadius: "6px", backgroundColor: "#141414", padding: "0.75rem" }}
        >
          <h4 style={{ margin: 0, fontSize: "0.875rem", fontWeight: 600, color: "#e5e5e5" }}>{group[0].action_type}</h4>
          <ul style={{ margin: "0.5rem 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {group.map((event, idx) => (
              <li key={idx} style={{ fontSize: "0.8125rem", color: "#a3a3a3" }}>
                <span style={{ fontFamily: MONO, color: "#e5e5e5" }}>{event.function_name}</span>
                {" · "}
                <span style={{ fontFamily: MONO }}>{event.process_binary}</span>
                {" · "}
                <span style={{ color: "#22c55e" }}>{Math.round(event.confidence * 100)}%</span>
                {" · "}
                <span style={{ color: "#737373" }}>{event.method}</span>
                {parseReasons(event.reasons).map((reason, r) => (
                  <div key={r} style={{ fontSize: "0.6875rem", color: "#737373" }}>
                    {reason}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
