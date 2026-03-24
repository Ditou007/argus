"use client";

import { useState, useCallback } from "react";
import { EventStats } from "@/components/event-stats";
import { EventFilterBar } from "@/components/event-filters";
import { EventTable } from "@/components/event-table";
import type { EventFilters } from "@/lib/api";

export default function Home() {
  const [filters, setFilters] = useState<EventFilters>({});

  const handleFilterChange = useCallback((next: EventFilters) => {
    setFilters(next);
  }, []);

  return (
    <main style={{ padding: "1.5rem 2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
          Event Stream
        </h1>
        <p style={{ color: "#737373", margin: "0.25rem 0 0", fontSize: "0.875rem" }}>
          Real-time kernel events captured by Tetragon eBPF
        </p>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <EventStats />
      </div>

      <div
        style={{
          border: "1px solid #262626",
          borderRadius: "8px",
          backgroundColor: "#141414",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "1rem 1rem 0.75rem", borderBottom: "1px solid #262626" }}>
          <EventFilterBar filters={filters} onChange={handleFilterChange} />
        </div>
        <EventTable filters={filters} />
      </div>
    </main>
  );
}
