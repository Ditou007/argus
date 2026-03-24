"use client";

import { useEffect, useState } from "react";
import { fetchStats, type StatEntry } from "@/lib/api";

const TYPE_COLORS: Record<string, string> = {
  process_exec: "#22c55e",
  process_exit: "#f59e0b",
  process_kprobe: "#3b82f6",
  unknown: "#737373",
};

export const EventStats = () => {
  const [stats, setStats] = useState<StatEntry[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const load = () => {
      fetchStats()
        .then((data) => {
          setStats(data.stats);
          setTotal(data.total);
        })
        .catch(() => {});
    };

    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
      <StatCard label="Total Events" value={total} color="#e5e5e5" />
      {stats.map((s) => (
        <StatCard
          key={s.event_type}
          label={s.event_type}
          value={parseInt(s.count, 10)}
          color={TYPE_COLORS[s.event_type] ?? "#737373"}
        />
      ))}
    </div>
  );
};

const StatCard = ({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) => (
  <div
    style={{
      flex: "1 1 150px",
      padding: "1rem 1.25rem",
      backgroundColor: "#141414",
      border: "1px solid #262626",
      borderLeft: `3px solid ${color}`,
      borderRadius: "6px",
    }}
  >
    <div style={{ fontSize: "0.75rem", color: "#a3a3a3", marginBottom: "0.25rem" }}>
      {label.replace("process_", "").replace("_", " ").toUpperCase()}
    </div>
    <div style={{ fontSize: "1.5rem", fontWeight: 600, color }}>
      {value.toLocaleString()}
    </div>
  </div>
);
