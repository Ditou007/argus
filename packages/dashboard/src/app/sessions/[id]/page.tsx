"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchSessionTimeline, formatTimeAgo, type AgentSession, type TimelineEntry } from "@/lib/api";
import { SessionTimeline } from "@/components/session-timeline";
import { useLiveStream } from "@/hooks/use-live-stream";

export default function SessionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [session, setSession] = useState<AgentSession | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveEventCount, setLiveEventCount] = useState(0);

  // Initial load
  useEffect(() => {
    fetchSessionTimeline(id)
      .then((data) => {
        setSession(data.session);
        setTimeline(data.timeline);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Live event stream — append kernel events as they arrive
  const handleEvent = useCallback((data: { id: number; event_type: string; pod_name: string; process_pid: number | null; process_binary: string | null; function_name: string | null; event_time: string | null }) => {
    setLiveEventCount((c) => c + 1);

    // Add to the "latest action" in the timeline as an unscored event
    setTimeline((prev) => {
      if (prev.length === 0) return prev;

      const updated = [...prev];
      const lastIdx = updated.length - 1;
      const lastEntry = updated[lastIdx];

      // Only append to the last action if it hasn't ended yet, or is the most recent
      const liveEvent = {
        id: data.id,
        event_type: data.event_type,
        process_binary: data.process_binary,
        process_pid: data.process_pid,
        function_name: data.function_name,
        raw_event: {},
        created_at: data.event_time ?? new Date().toISOString(),
        // Mark as live (unscored)
        confidence: undefined as number | undefined,
        correlation_method: "live_stream" as string | undefined,
        signal_scores: undefined as Record<string, number> | undefined,
      };

      updated[lastIdx] = {
        ...lastEntry,
        events: [...lastEntry.events, liveEvent],
      };

      return updated;
    });
  }, []);

  // Live correlation updates — replace event counts with scored results
  const handleCorrelation = useCallback((data: { action_id: string; events_correlated: number; high_confidence: number; medium_confidence: number; low_confidence: number }) => {
    // Reload the full timeline to get properly scored events
    fetchSessionTimeline(id)
      .then((freshData) => {
        setSession(freshData.session);
        setTimeline(freshData.timeline);
      })
      .catch(() => {});
  }, [id]);

  // Live action notifications — add new actions to the timeline
  const handleAction = useCallback((data: { action_id: string; session_id: string; action_type: string; action_name: string | null; status: "started" | "ended" }) => {
    if (data.session_id !== id) return;

    if (data.status === "started") {
      setTimeline((prev) => [
        ...prev,
        {
          action: {
            id: data.action_id,
            session_id: data.session_id,
            action_type: data.action_type,
            action_name: data.action_name,
            input_summary: null,
            output_summary: null,
            metadata: {},
            started_at: new Date().toISOString(),
            ended_at: null,
            created_at: new Date().toISOString(),
          },
          events: [],
        },
      ]);
    }

    if (data.status === "ended") {
      setTimeline((prev) =>
        prev.map((entry) =>
          entry.action.id === data.action_id
            ? { ...entry, action: { ...entry.action, ended_at: new Date().toISOString() } }
            : entry
        )
      );
    }
  }, [id]);

  // Live session notifications — mark as ended
  const handleSession = useCallback((data: { session_id: string; status: "started" | "ended" }) => {
    if (data.session_id === id && data.status === "ended") {
      // Reload to get final batch-correlated data
      setTimeout(() => {
        fetchSessionTimeline(id)
          .then((freshData) => {
            setSession(freshData.session);
            setTimeline(freshData.timeline);
          })
          .catch(() => {});
      }, 1000);
    }
  }, [id]);

  const { connected } = useLiveStream({
    sessionId: id,
    onEvent: handleEvent,
    onCorrelation: handleCorrelation,
    onAction: handleAction,
    onSession: handleSession,
  });

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
              {/* WebSocket connection indicator */}
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
            <div style={{ fontSize: "0.8125rem", color: "#a3a3a3" }}>
              PID {session.agent_pid}
              {session.host_name && ` on ${session.host_name}`}
              {" — "}Started {formatTimeAgo(session.started_at)}
              {duration !== null && ` — Duration: ${duration}s`}
            </div>
          </div>

          <div style={{ display: "flex", gap: "2rem" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{timeline.length}</div>
              <div style={{ fontSize: "0.6875rem", color: "#737373" }}>Actions</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 600, color: "#3b82f6" }}>
                {timeline.reduce((sum, t) => sum + t.events.length, 0)}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "#737373" }}>Events</div>
            </div>
            {liveEventCount > 0 && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 600, color: "#22c55e" }}>
                  {liveEventCount}
                </div>
                <div style={{ fontSize: "0.6875rem", color: "#737373" }}>Live</div>
              </div>
            )}
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
          <span
            style={{
              fontSize: "0.75rem",
              color: "#22c55e",
              fontWeight: 400,
              marginLeft: "0.5rem",
              animation: "pulse 2s infinite",
            }}
          >
            Live
          </span>
        )}
      </h2>

      <SessionTimeline timeline={timeline} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </main>
  );
}
