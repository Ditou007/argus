"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchSessionTrace, type TraceEvent } from "@/lib/api";
import { CorrelatedTrace } from "@/components/correlated-trace";

/**
 * Forensic replay page: a session's full ClickHouse-backed correlated trace
 * (SPEC_04). Renders each declared action with its attributed syscalls + verdict.
 * @function SessionTracePage
 * @returns the rendered forensic-trace page
 */
export default function SessionTracePage() {
  const params = useParams();
  const id = params.id as string;
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSessionTrace(id)
      .then((data) => setEvents(data.events))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load trace"));
  }, [id]);

  return (
    <main style={{ padding: "1.5rem 2rem", maxWidth: "1000px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1rem", fontSize: "0.8125rem" }}>
        <Link href={`/sessions/${id}`} style={{ color: "#737373", textDecoration: "none" }}>
          ← Session
        </Link>
      </div>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 1rem" }}>
        Forensic trace <span style={{ fontSize: "0.8125rem", color: "#737373" }}>(ClickHouse)</span>
      </h1>
      {error && <p style={{ color: "#ef4444", fontSize: "0.8125rem" }}>{error}</p>}
      <CorrelatedTrace events={events} />
    </main>
  );
}
