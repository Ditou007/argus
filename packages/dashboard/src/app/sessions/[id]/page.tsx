"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchSessionTimeline, formatTimeAgo, type AgentSession, type TimelineEntry } from "@/lib/api";
import { SessionTimeline } from "@/components/session-timeline";

export default function SessionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [session, setSession] = useState<AgentSession | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      fetchSessionTimeline(id)
        .then((data) => {
          setSession(data.session);
          setTimeline(data.timeline);
          setError(null);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    };

    load();
    // Refresh every 5 seconds if session is active
    const interval = setInterval(() => {
      if (session && !session.ended_at) load();
    }, 5_000);
    return () => clearInterval(interval);
  }, [id, session?.ended_at]);

  if (loading) {
    return (
      <main style={{ padding: "2rem", textAlign: "center", color: "#737373" }}>
        Loading session...
      </main>
    );
  }

  if (error || !session) {
    return (
      <main style={{ padding: "2rem", textAlign: "center", color: "#ef4444" }}>
        {error ?? "Session not found"}
      </main>
    );
  }

  const isActive = !session.ended_at;
  const duration = session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000)
    : null;

  return (
    <main style={{ padding: "1.5rem 2rem", maxWidth: "1000px", margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: "1rem", fontSize: "0.8125rem" }}>
        <Link href="/sessions" style={{ color: "#737373", textDecoration: "none" }}>
          Sessions
        </Link>
        <span style={{ color: "#525252", margin: "0 0.5rem" }}>/</span>
        <span style={{ color: "#a3a3a3" }}>{session.agent_name}</span>
      </div>

      {/* Session header */}
      <div
        style={{
          border: "1px solid #262626",
          borderRadius: "8px",
          backgroundColor: "#141414",
          padding: "1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: isActive ? "#22c55e" : "#737373",
                }}
              />
              <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
                {session.agent_name}
              </h1>
            </div>
            <div style={{ fontSize: "0.8125rem", color: "#a3a3a3" }}>
              PID {session.agent_pid}
              {session.host_name && ` on ${session.host_name}`}
              {" — "}Started {formatTimeAgo(session.started_at)}
              {duration !== null && ` — Duration: ${duration}s`}
            </div>
          </div>

          <div style={{ display: "flex", gap: "2rem" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{session.action_count ?? 0}</div>
              <div style={{ fontSize: "0.6875rem", color: "#737373" }}>Actions</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 600, color: "#3b82f6" }}>
                {session.event_count ?? 0}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "#737373" }}>Events</div>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.5rem 0.75rem",
            backgroundColor: "#0a0a0a",
            borderRadius: "4px",
            fontSize: "0.6875rem",
            fontFamily: "monospace",
            color: "#525252",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          Session ID: {session.id}
        </div>
      </div>

      {/* Timeline */}
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
        Action Timeline
        {isActive && (
          <span style={{ fontSize: "0.75rem", color: "#22c55e", fontWeight: 400, marginLeft: "0.5rem" }}>
            Live
          </span>
        )}
      </h2>

      <SessionTimeline timeline={timeline} />
    </main>
  );
}
