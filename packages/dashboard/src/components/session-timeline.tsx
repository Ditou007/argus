"use client";

import { formatTimeAgo, type TimelineEntry, type StoredEvent } from "@/lib/api";

const ACTION_TYPE_COLORS: Record<string, string> = {
  llm_call: "#a78bfa",
  network_request: "#3b82f6",
  file_read: "#22c55e",
  file_write: "#f59e0b",
  tool_use: "#f97316",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "#22c55e",
  medium: "#f59e0b",
};

interface SessionTimelineProps {
  timeline: TimelineEntry[];
}

export const SessionTimeline = ({ timeline }: SessionTimelineProps) => {
  if (timeline.length === 0) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#737373" }}>
        No actions recorded for this session.
      </div>
    );
  }

  return (
    <div style={{ position: "relative", paddingLeft: "2rem" }}>
      {/* Vertical line */}
      <div
        style={{
          position: "absolute",
          left: "0.75rem",
          top: 0,
          bottom: 0,
          width: 2,
          backgroundColor: "#262626",
        }}
      />

      {timeline.map(({ action, events }, idx) => {
        const color = ACTION_TYPE_COLORS[action.action_type] ?? "#737373";
        const duration = action.ended_at
          ? Math.round((new Date(action.ended_at).getTime() - new Date(action.started_at).getTime()) / 1000)
          : null;

        return (
          <div key={action.id} style={{ marginBottom: idx < timeline.length - 1 ? "1.5rem" : 0, position: "relative" }}>
            {/* Timeline dot */}
            <div
              style={{
                position: "absolute",
                left: "-1.625rem",
                top: "0.375rem",
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: color,
                border: "2px solid #0a0a0a",
              }}
            />

            {/* Action card */}
            <div
              style={{
                border: "1px solid #262626",
                borderLeft: `3px solid ${color}`,
                borderRadius: "6px",
                backgroundColor: "#141414",
                overflow: "hidden",
              }}
            >
              {/* Action header */}
              <div style={{ padding: "0.75rem 1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.125rem 0.5rem",
                        borderRadius: "4px",
                        fontSize: "0.6875rem",
                        fontWeight: 500,
                        fontFamily: "monospace",
                        backgroundColor: `${color}1a`,
                        color,
                        border: `1px solid ${color}33`,
                        marginRight: "0.5rem",
                      }}
                    >
                      {action.action_type}
                    </span>
                    {action.action_name && (
                      <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                        {action.action_name}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                    {duration !== null && (
                      <span style={{ fontSize: "0.75rem", color: "#a3a3a3", fontFamily: "monospace" }}>
                        {duration}s
                      </span>
                    )}
                    <span style={{ fontSize: "0.75rem", color: "#a3a3a3" }}>
                      {formatTimeAgo(action.started_at)}
                    </span>
                  </div>
                </div>

                {action.input_summary && (
                  <div style={{ fontSize: "0.75rem", color: "#a3a3a3", marginTop: "0.375rem", fontFamily: "monospace" }}>
                    {action.input_summary}
                  </div>
                )}

                {action.output_summary && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#737373",
                      marginTop: "0.25rem",
                      fontFamily: "monospace",
                      maxHeight: 60,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {action.output_summary}
                  </div>
                )}
              </div>

              {/* Correlated events */}
              {events.length > 0 && (
                <div style={{ borderTop: "1px solid #262626" }}>
                  <div
                    style={{
                      padding: "0.5rem 1rem",
                      fontSize: "0.6875rem",
                      color: "#737373",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>Correlated Kernel Events</span>
                    <span>{events.length} events</span>
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {events.map((event) => (
                      <EventRow key={event.id} event={event} />
                    ))}
                  </div>
                </div>
              )}

              {events.length === 0 && action.ended_at && (
                <div
                  style={{
                    borderTop: "1px solid #262626",
                    padding: "0.5rem 1rem",
                    fontSize: "0.75rem",
                    color: "#525252",
                    fontStyle: "italic",
                  }}
                >
                  No kernel events correlated
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const EventRow = ({ event }: { event: StoredEvent & { confidence?: number; correlation_method?: string } }) => {
  const confidence = event.confidence ?? 1.0;
  const confColor = confidence >= 0.9 ? CONFIDENCE_COLORS.high : CONFIDENCE_COLORS.medium;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.25rem 1rem",
        fontSize: "0.75rem",
        borderBottom: "1px solid #1a1a1a",
        fontFamily: "monospace",
      }}
    >
      <span style={{ color: "#525252", minWidth: 35 }}>
        {event.event_type.replace("process_", "")}
      </span>
      <span style={{ color: "#a3a3a3", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {event.function_name ?? event.process_binary ?? "-"}
      </span>
      <span style={{ color: "#525252", minWidth: 50 }}>
        PID {event.process_pid}
      </span>
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: confColor,
        }}
        title={`${(confidence * 100).toFixed(0)}% confidence (${event.correlation_method})`}
      />
    </div>
  );
};
