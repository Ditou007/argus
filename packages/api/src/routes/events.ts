import { Router, type IRouter } from "express";
import pg from "pg";
import { config } from "../config.js";

export const createEventsRouter = (pool: pg.Pool): IRouter => {
  const router = Router();

  // GET /api/events — list events with filtering
  router.get("/", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const eventType = req.query.type as string | undefined;
      const binary = req.query.binary as string | undefined;

      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (eventType) {
        params.push(eventType);
        conditions.push(`event_type = $${params.length}`);
      }

      if (binary) {
        params.push(`%${binary}%`);
        conditions.push(`process_binary ILIKE $${params.length}`);
      }

      let query = "SELECT * FROM events";
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`;
      }

      query += " ORDER BY created_at DESC";
      params.push(limit);
      query += ` LIMIT $${params.length}`;
      params.push(offset);
      query += ` OFFSET $${params.length}`;

      const result = await pool.query(query, params);

      // Get total count for pagination
      let countQuery = "SELECT COUNT(*) FROM events";
      const countParams: string[] = [];
      if (eventType) {
        countParams.push(eventType);
        countQuery += ` WHERE event_type = $${countParams.length}`;
      }
      if (binary) {
        countParams.push(`%${binary}%`);
        const prefix = countParams.length === 1 ? " WHERE" : " AND";
        countQuery += `${prefix} process_binary ILIKE $${countParams.length}`;
      }
      const countResult = await pool.query(countQuery, countParams);

      res.json({
        events: result.rows,
        count: result.rowCount,
        total: parseInt(countResult.rows[0].count, 10),
        limit,
        offset,
      });
    } catch (err) {
      console.error("Failed to fetch events:", err);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // GET /api/events/stats — event count by type
  router.get("/stats", async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT event_type, COUNT(*) as count
        FROM events
        GROUP BY event_type
        ORDER BY count DESC
      `);

      const totalResult = await pool.query("SELECT COUNT(*) FROM events");

      res.json({
        stats: result.rows,
        total: parseInt(totalResult.rows[0].count, 10),
      });
    } catch (err) {
      console.error("Failed to fetch stats:", err);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  return router;
};
