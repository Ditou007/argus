import { Router, type IRouter, type RequestHandler } from "express";
import type { TraceReader } from "../correlation/trace-reader.js";

/**
 * Build the forensic replay route: GET /api/sessions/:id/trace returns a
 * session's full correlated trace (declared actions + attributed events +
 * verdict) from ClickHouse for audit/replay.
 * @function createTraceRouter
 * @param reader - the ClickHouse trace reader
 * @returns an Express router with the trace route
 */
export const createTraceRouter = (reader: TraceReader): IRouter => {
  const router = Router();
  const getTrace: RequestHandler = async (req, res) => {
    try {
      const events = await reader.getSessionTrace(req.params.id);
      res.json({ session_id: req.params.id, count: events.length, events });
    } catch (err) {
      console.error("Failed to fetch trace:", err);
      res.status(500).json({ error: "Failed to fetch trace" });
    }
  };
  router.get("/:id/trace", getTrace);
  return router;
};
