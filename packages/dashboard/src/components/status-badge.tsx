"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api";

export const StatusBadge = () => {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const check = () => {
      fetchHealth()
        .then((h) => setConnected(h.status === "healthy"))
        .catch(() => setConnected(false));
    };

    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: connected ? "#22c55e" : "#ef4444",
        }}
      />
      <span style={{ fontSize: "0.75rem", color: "#a3a3a3" }}>
        {connected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
};
