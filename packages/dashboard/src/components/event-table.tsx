"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchEvents, formatTimeAgo, type StoredEvent, type EventFilters } from "@/lib/api";

const TYPE_COLORS: Record<string, string> = {
  process_exec: "#22c55e",
  process_exit: "#f59e0b",
  process_kprobe: "#3b82f6",
  unknown: "#737373",
};

interface EventTableProps {
  filters: EventFilters;
}

const PAGE_SIZE = 50;

export const EventTable = ({ filters }: EventTableProps) => {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  const load = useCallback(
    async (currentOffset: number) => {
      try {
        setLoading(true);
        const data = await fetchEvents({
          ...filters,
          limit: PAGE_SIZE,
          offset: currentOffset,
        });
        if (currentOffset === 0) {
          setEvents(data.events);
        } else {
          setEvents((prev) => [...prev, ...data.events]);
        }
        setTotal(data.total);
      } catch {
        // silently fail, will retry
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  // Reset on filter change
  useEffect(() => {
    setOffset(0);
    setEvents([]);
    load(0);
  }, [load]);

  // Auto-refresh every 5 seconds (only page 0)
  useEffect(() => {
    const interval = setInterval(() => {
      if (offset === 0) load(0);
    }, 5_000);
    return () => clearInterval(interval);
  }, [load, offset]);

  const handleLoadMore = () => {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    load(next);
  };

  const hasMore = events.length < total;

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.8125rem",
          }}
        >
          <thead>
            <tr>
              {["Time", "Type", "Binary", "PID", "Function"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "0.625rem 0.75rem",
                    borderBottom: "1px solid #262626",
                    color: "#a3a3a3",
                    fontWeight: 500,
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr
                key={e.id}
                style={{
                  borderBottom: "1px solid #1a1a1a",
                  transition: "background-color 0.15s",
                }}
                onMouseEnter={(ev) =>
                  ((ev.currentTarget as HTMLElement).style.backgroundColor = "#1a1a1a")
                }
                onMouseLeave={(ev) =>
                  ((ev.currentTarget as HTMLElement).style.backgroundColor = "transparent")
                }
              >
                <td style={{ padding: "0.5rem 0.75rem", color: "#a3a3a3", whiteSpace: "nowrap" }}>
                  {formatTimeAgo(e.created_at)}
                </td>
                <td style={{ padding: "0.5rem 0.75rem" }}>
                  <TypeBadge type={e.event_type} />
                </td>
                <td
                  style={{
                    padding: "0.5rem 0.75rem",
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                    maxWidth: 300,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {e.process_binary ?? "-"}
                </td>
                <td
                  style={{
                    padding: "0.5rem 0.75rem",
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                  }}
                >
                  {e.process_pid ?? "-"}
                </td>
                <td
                  style={{
                    padding: "0.5rem 0.75rem",
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                    color: "#a3a3a3",
                  }}
                >
                  {e.function_name ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && events.length === 0 && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#737373" }}>
          Loading events...
        </div>
      )}

      {!loading && events.length === 0 && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#737373" }}>
          No events found. Start the ingestion service and run the sample agent.
        </div>
      )}

      {hasMore && (
        <div style={{ padding: "1rem", textAlign: "center" }}>
          <button
            onClick={handleLoadMore}
            disabled={loading}
            style={{
              padding: "0.5rem 1.5rem",
              backgroundColor: "#262626",
              border: "1px solid #404040",
              borderRadius: "6px",
              color: "#e5e5e5",
              cursor: loading ? "wait" : "pointer",
              fontSize: "0.8125rem",
            }}
          >
            {loading ? "Loading..." : `Load More (${events.length} of ${total})`}
          </button>
        </div>
      )}
    </div>
  );
};

const TypeBadge = ({ type }: { type: string }) => {
  const color = TYPE_COLORS[type] ?? "#737373";
  const label = type.replace("process_", "");
  return (
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
      }}
    >
      {label}
    </span>
  );
};
