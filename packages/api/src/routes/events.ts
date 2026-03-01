import { Router, type IRouter } from "express";
import pg from "pg";
import { config } from "../config.js";

export const eventsRouter: IRouter = Router();

const pool = new pg.Pool(config.database);

// GET /api/events — list events with basic filtering
eventsRouter.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const eventType = req.query.type as string | undefined;

    let query = "SELECT * FROM events";
    const params: (string | number)[] = [];

    if (eventType) {
      params.push(eventType);
      query += ` WHERE event_type = $${params.length}`;
    }

    query += " ORDER BY created_at DESC";
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    params.push(offset);
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    res.json({
      events: result.rows,
      count: result.rowCount,
      limit,
      offset,
    });
  } catch (err) {
    console.error("Failed to fetch events:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// GET /api/events/stats — event count by type
eventsRouter.get("/stats", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT event_type, COUNT(*) as count
      FROM events
      GROUP BY event_type
      ORDER BY count DESC
    `);

    res.json({ stats: result.rows });
  } catch (err) {
    console.error("Failed to fetch stats:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});
