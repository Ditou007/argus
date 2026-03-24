"use client";

import { useEffect, useRef, useCallback, useState } from "react";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";

// Mirror the server-side message types
interface EventNotification {
  type: "event";
  data: {
    id: number;
    event_type: string;
    pod_name: string;
    process_pid: number | null;
    process_binary: string | null;
    function_name: string | null;
    event_time: string | null;
  };
}

interface CorrelationNotification {
  type: "correlation";
  data: {
    action_id: string;
    events_correlated: number;
    high_confidence: number;
    medium_confidence: number;
    low_confidence: number;
    method: string;
    top_signals: string[];
  };
}

interface SessionNotification {
  type: "session";
  data: {
    session_id: string;
    status: "started" | "ended";
    agent_name: string;
    pod_name: string | null;
  };
}

interface ActionNotification {
  type: "action";
  data: {
    action_id: string;
    session_id: string;
    action_type: string;
    action_name: string | null;
    status: "started" | "ended";
  };
}

type WsMessage = EventNotification | CorrelationNotification | SessionNotification | ActionNotification;

interface UseLiveStreamOptions {
  sessionId?: string;
  onEvent?: (data: EventNotification["data"]) => void;
  onCorrelation?: (data: CorrelationNotification["data"]) => void;
  onSession?: (data: SessionNotification["data"]) => void;
  onAction?: (data: ActionNotification["data"]) => void;
}

export const useLiveStream = (options: UseLiveStreamOptions) => {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);

      // Subscribe to the session if provided
      if (optionsRef.current.sessionId) {
        ws.send(JSON.stringify({ type: "subscribe", session_id: optionsRef.current.sessionId }));
      } else {
        ws.send(JSON.stringify({ type: "subscribe_all" }));
      }
    };

    ws.onmessage = (evt) => {
      try {
        const msg: WsMessage = JSON.parse(evt.data);

        switch (msg.type) {
          case "event":
            optionsRef.current.onEvent?.(msg.data);
            break;
          case "correlation":
            optionsRef.current.onCorrelation?.(msg.data);
            break;
          case "session":
            optionsRef.current.onSession?.(msg.data);
            break;
          case "action":
            optionsRef.current.onAction?.(msg.data);
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 2 seconds
      reconnectTimeout.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Re-subscribe when sessionId changes
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && options.sessionId) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", session_id: options.sessionId }));
    }
  }, [options.sessionId]);

  return { connected };
};
