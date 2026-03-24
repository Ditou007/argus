import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { Redis } from "ioredis";
import type pg from "pg";
import { createCorrelator } from "../correlation/correlator.js";

interface LiveStreamConfig {
  redis: { host: string; port: number };
}

// Message types sent to dashboard clients
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

// Track which sessions each client is subscribed to
interface ClientState {
  ws: WebSocket;
  subscribedSessions: Set<string>;
  subscribedPods: Set<string>;
}

// Track active sessions: session_id -> pod_name
const activeSessions = new Map<string, string>();

// Track open actions that need incremental correlation
// action_id -> { session_id, pod_name }
const openActions = new Map<string, { sessionId: string; podName: string }>();

export const createLiveStream = (server: Server, pool: pg.Pool, config: LiveStreamConfig) => {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients: ClientState[] = [];
  const correlator = createCorrelator(pool);

  // Redis subscriber for event notifications from ingestion
  const redisSub = new Redis(config.redis);
  redisSub.on("error", (err) => {
    console.error("Redis sub error:", err.message);
  });

  // Subscribe to event notifications
  redisSub.subscribe("argus:events").catch((err) => {
    console.error("Failed to subscribe to argus:events:", err.message);
  });

  // Debounce map for incremental correlation: action_id -> timeout
  const correlationTimers = new Map<string, NodeJS.Timeout>();
  const CORRELATION_DEBOUNCE_MS = 2000;

  redisSub.on("message", (_channel, message) => {
    try {
      const event = JSON.parse(message);
      const podName = event.pod_name;

      // Forward to clients subscribed to this pod
      const notification: EventNotification = { type: "event", data: event };
      broadcast(notification, podName);

      // Trigger incremental correlation for open actions matching this pod
      for (const [actionId, meta] of openActions) {
        if (meta.podName === podName) {
          scheduleCorrelation(actionId);
        }
      }
    } catch {
      // Ignore malformed messages
    }
  });

  const scheduleCorrelation = (actionId: string) => {
    // Debounce: don't re-correlate on every single event, batch them
    const existing = correlationTimers.get(actionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      correlationTimers.delete(actionId);
      try {
        const result = await correlator.correlateAction(actionId);
        const notification: CorrelationNotification = {
          type: "correlation",
          data: result,
        };
        // Find the pod for this action to know which clients to notify
        const meta = openActions.get(actionId);
        if (meta) {
          broadcastToSession(notification, meta.sessionId);
        }
      } catch (err) {
        // Action may have been deleted or not yet ended — ignore
      }
    }, CORRELATION_DEBOUNCE_MS);

    correlationTimers.set(actionId, timer);
  };

  const broadcast = (msg: WsMessage, podName: string) => {
    const payload = JSON.stringify(msg);
    for (const client of clients) {
      if (client.ws.readyState === WebSocket.OPEN && client.subscribedPods.has(podName)) {
        client.ws.send(payload);
      }
    }
  };

  const broadcastToSession = (msg: WsMessage, sessionId: string) => {
    const payload = JSON.stringify(msg);
    for (const client of clients) {
      if (client.ws.readyState === WebSocket.OPEN && client.subscribedSessions.has(sessionId)) {
        client.ws.send(payload);
      }
    }
  };

  // Broadcast to ALL connected clients (for new session announcements)
  const broadcastAll = (msg: WsMessage) => {
    const payload = JSON.stringify(msg);
    for (const client of clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  };

  wss.on("connection", (ws) => {
    const client: ClientState = {
      ws,
      subscribedSessions: new Set(),
      subscribedPods: new Set(),
    };
    clients.push(client);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // Client subscribes to a session — we look up its pod_name
        if (msg.type === "subscribe" && msg.session_id) {
          client.subscribedSessions.add(msg.session_id);
          const podName = activeSessions.get(msg.session_id);
          if (podName) {
            client.subscribedPods.add(podName);
          }
          // Also look up from DB in case session started before WS connected
          pool.query("SELECT pod_name FROM agent_sessions WHERE id = $1", [msg.session_id])
            .then((result) => {
              const pod = result.rows[0]?.pod_name;
              if (pod) {
                client.subscribedPods.add(pod);
                activeSessions.set(msg.session_id, pod);
              }
            })
            .catch(() => {});
        }

        // Client subscribes to all events (session list view)
        if (msg.type === "subscribe_all") {
          // Add a wildcard marker — broadcastAll will reach them
          client.subscribedSessions.add("*");
        }

        if (msg.type === "unsubscribe" && msg.session_id) {
          client.subscribedSessions.delete(msg.session_id);
        }
      } catch {
        // Ignore malformed client messages
      }
    });

    ws.on("close", () => {
      const idx = clients.indexOf(client);
      if (idx !== -1) clients.splice(idx, 1);
    });
  });

  // Public API for routes to push notifications
  const notifySessionStarted = (sessionId: string, agentName: string, podName: string | null) => {
    if (podName) {
      activeSessions.set(sessionId, podName);
    }
    broadcastAll({
      type: "session",
      data: { session_id: sessionId, status: "started", agent_name: agentName, pod_name: podName },
    });
  };

  const notifySessionEnded = (sessionId: string, agentName: string, podName: string | null) => {
    activeSessions.delete(sessionId);
    broadcastAll({
      type: "session",
      data: { session_id: sessionId, status: "ended", agent_name: agentName, pod_name: podName },
    });
  };

  const notifyActionStarted = (actionId: string, sessionId: string, actionType: string, actionName: string | null, podName: string | null) => {
    if (podName) {
      openActions.set(actionId, { sessionId, podName });
    }
    broadcastToSession({
      type: "action",
      data: { action_id: actionId, session_id: sessionId, action_type: actionType, action_name: actionName, status: "started" },
    }, sessionId);
  };

  const notifyActionEnded = (actionId: string, sessionId: string, actionType: string, actionName: string | null) => {
    openActions.delete(actionId);
    broadcastToSession({
      type: "action",
      data: { action_id: actionId, session_id: sessionId, action_type: actionType, action_name: actionName, status: "ended" },
    }, sessionId);
  };

  const notifyCorrelation = (sessionId: string, correlation: CorrelationNotification["data"]) => {
    broadcastToSession({ type: "correlation", data: correlation }, sessionId);
  };

  const close = async () => {
    for (const timer of correlationTimers.values()) clearTimeout(timer);
    wss.close();
    await redisSub.quit();
  };

  console.log("WebSocket live stream ready on /ws");

  return {
    notifySessionStarted,
    notifySessionEnded,
    notifyActionStarted,
    notifyActionEnded,
    notifyCorrelation,
    close,
  };
};
