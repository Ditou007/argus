import express, { type Express } from "express";
import { WebSocketServer } from "ws";
import type { Server } from "node:http";
import { runChatTurn, type ChatTurnDeps } from "./loop.js";
import type { Logger } from "./logger.js";

/**
 * HTTP + WebSocket chat surface. POST /chat runs one turn and returns the reply
 * plus what each tool call did (and whether it was declared). The WS endpoint
 * streams the same result. Both delegate to the same pure {@link runChatTurn}.
 */

interface ServerOptions {
  readonly deps: ChatTurnDeps;
  readonly log: Logger;
}

const MAX_MESSAGE_LEN = 4000;

const isValidMessage = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= MAX_MESSAGE_LEN;

/**
 * Build the chat HTTP app: GET /health and POST /chat (one turn via runChatTurn).
 * @function createApp
 * @param options - Chat-turn deps and logger.
 * @returns The configured Express app.
 */
export const createApp = (options: ServerOptions): Express => {
  const { deps, log } = options;
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "healthy", service: "argus-agent" });
  });

  app.post("/chat", async (req, res) => {
    const message: unknown = req.body?.message;
    if (!isValidMessage(message)) {
      res.status(400).json({ error: "message must be a non-empty string up to 4000 chars" });
      return;
    }
    try {
      const result = await runChatTurn(deps, message);
      res.json(result);
    } catch (err) {
      log.error("chat_turn_failed", { error: err instanceof Error ? err.message : String(err) });
      res.status(502).json({ error: "agent failed to complete the turn" });
    }
  });

  return app;
};

/** Attach a WebSocket chat endpoint to an already-listening HTTP server. */
export const attachChatSocket = (server: Server, options: ServerOptions): WebSocketServer => {
  const { deps, log } = options;
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket) => {
    socket.on("message", async (raw) => {
      let message: unknown;
      try {
        message = (JSON.parse(raw.toString()) as { message?: unknown }).message;
      } catch {
        socket.send(JSON.stringify({ error: "invalid JSON" }));
        return;
      }
      if (!isValidMessage(message)) {
        socket.send(JSON.stringify({ error: "message must be a non-empty string" }));
        return;
      }
      try {
        const result = await runChatTurn(deps, message);
        socket.send(JSON.stringify(result));
      } catch (err) {
        log.error("ws_chat_turn_failed", { error: err instanceof Error ? err.message : String(err) });
        socket.send(JSON.stringify({ error: "agent failed to complete the turn" }));
      }
    });
  });

  return wss;
};
