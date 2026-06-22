"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchEvents, formatTimeAgo, type StoredEvent, type EventFilters } from "@/lib/api";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { TypeBadge } from "@/components/event-type-badge";

interface EventTableProps {
  filters: EventFilters;
}

const PAGE_SIZE = 50;
// Bound the rendered window so deep infinite-scroll can't grow the DOM until the
// tab freezes. ~1000 rows renders fine without virtualization; beyond it we stop
// auto-loading and ask the user to narrow filters (older rows stay in the store).
const MAX_ROWS = 1000;

/**
 * Paginated, auto-loading event table. Infinite scroll loads older pages as the
 * sentinel scrolls into view; the rendered window is capped at MAX_ROWS so the
 * DOM stays bounded (no browser freeze on a busy firehose).
 * @function EventTable
 * @param props - the active event filters
 * @returns the events table with infinite scroll
 */
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

  const handleLoadMore = useCallback(() => {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    load(next);
  }, [offset, load]);

  const cappedAtMax = events.length >= MAX_ROWS;
  const hasMore = events.length < total && !cappedAtMax;
  // Infinite scroll: auto-load older pages as the sentinel nears the viewport.
  const sentinelRef = useInfiniteScroll(handleLoadMore, hasMore && !loading);

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

      {/* Infinite-scroll sentinel: auto-loads the next page when scrolled near. */}
      {hasMore && (
        <div ref={sentinelRef} style={{ padding: "1rem", textAlign: "center", color: "#737373", fontSize: "0.8125rem" }}>
          {loading ? "Loading more…" : `Scroll for more (${events.length} of ${total})`}
        </div>
      )}

      {cappedAtMax && events.length < total && (
        <div style={{ padding: "1rem", textAlign: "center", color: "#737373", fontSize: "0.8125rem" }}>
          Showing the first {MAX_ROWS.toLocaleString()} of {total.toLocaleString()} — narrow the filters to see older events.
        </div>
      )}
    </div>
  );
};
