"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { fetchSessions, formatTimeAgo, type AgentSession } from "@/lib/api";
import { useLiveStream } from "@/hooks/use-live-stream";

const STATUS_COLORS = {
  active: "#22c55e",
  ended: "#737373",
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions()
      .then((data) => setSessions(data.sessions))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Live session notifications — reload when sessions start/end
  const handleSession = useCallback(() => {
    fetchSessions()
      .then((data) => setSessions(data.sessions))
      .catch(() => {});
  }, []);

  const { connected } = useLiveStream({
    onSession: handleSession,
  });

  return (
    <main style={{ padding: "1.5rem 2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            Agent Sessions
          </h1>
          <p style={{ color: "#737373", margin: "0.25rem 0 0", fontSize: "0.875rem" }}>
            Track agent lifecycles and correlated kernel events
          </p>
        </div>
        <span
          style={{
            fontSize: "0.625rem",
            padding: "0.125rem 0.375rem",
            borderRadius: "4px",
            backgroundColor: connected ? "#22c55e1a" : "#ef44441a",
            color: connected ? "#22c55e" : "#ef4444",
            border: `1px solid ${connected ? "#22c55e33" : "#ef444433"}`,
          }}
        >
          {connected ? "LIVE" : "OFFLINE"}
        </span>
      </div>

      <div
        style={{
          border: "1px solid #262626",
          borderRadius: "8px",
          backgroundColor: "#141414",
          overflow: "hidden",
        }}
      >
        {loading && (
          <div style={{ padding: "2rem", textAlign: "center", color: "#737373" }}>
            Loading sessions...
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div style={{ padding: "2rem", textAlign: "center", color: "#737373" }}>
            No sessions yet. Run the instrumented agent: <code>python sample-agent/agent_v2.py</code>
          </div>
        )}

        {sessions.map((s) => {
          const isActive = !s.ended_at;
          const statusColor = isActive ? STATUS_COLORS.active : STATUS_COLORS.ended;

          return (
            <Link
              key={s.id}
              href={`/sessions/${s.id}`}
              style={{
                display: "block",
                padding: "1rem 1.25rem",
                borderBottom: "1px solid #1a1a1a",
                textDecoration: "none",
                color: "#e5e5e5",
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.backgroundColor = "#1a1a1a")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")
              }
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: statusColor,
                      }}
                    />
                    <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                      {s.agent_name}
                    </span>
                    <span style={{ color: "#737373", fontSize: "0.75rem", fontFamily: "monospace" }}>
                      PID {s.agent_pid}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#a3a3a3" }}>
                    {isActive ? "Active" : "Ended"} — started {formatTimeAgo(s.started_at)}
                    {s.host_name && ` on ${s.host_name}`}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "1.5rem", textAlign: "right" }}>
                  <div>
                    <div style={{ fontSize: "1.125rem", fontWeight: 600 }}>
                      {s.action_count ?? 0}
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "#737373" }}>actions</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "#3b82f6" }}>
                      {s.event_count ?? 0}
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "#737373" }}>events</div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
