"use client";

import { useRef, useCallback } from "react";
import type { EventFilters } from "@/lib/api";

interface EventFilterBarProps {
  filters: EventFilters;
  onChange: (filters: EventFilters) => void;
}

const inputStyle = {
  padding: "0.5rem 0.75rem",
  backgroundColor: "#141414",
  border: "1px solid #262626",
  borderRadius: "6px",
  color: "#e5e5e5",
  fontSize: "0.875rem",
  outline: "none",
} as const;

export const EventFilterBar = ({ filters, onChange }: EventFilterBarProps) => {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleBinaryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange({ ...filters, binary: value || undefined, offset: 0 });
      }, 300);
    },
    [filters, onChange]
  );

  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onChange({ ...filters, type: value || undefined, offset: 0 });
    },
    [filters, onChange]
  );

  return (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
      <select
        value={filters.type ?? ""}
        onChange={handleTypeChange}
        style={{ ...inputStyle, cursor: "pointer" }}
      >
        <option value="">All Types</option>
        <option value="process_exec">process_exec</option>
        <option value="process_exit">process_exit</option>
        <option value="process_kprobe">process_kprobe</option>
      </select>

      <input
        type="text"
        placeholder="Filter by binary name..."
        defaultValue={filters.binary ?? ""}
        onChange={handleBinaryChange}
        style={{ ...inputStyle, flex: "1 1 200px" }}
      />
    </div>
  );
};
