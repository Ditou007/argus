import { Router, type IRouter } from "express";
import pg from "pg";
import { config } from "../config.js";

export const healthRouter: IRouter = Router();

const pool = new pg.Pool(config.database);

healthRouter.get("/", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "healthy", service: "argus-api", db: "connected" });
  } catch {
    res.status(503).json({ status: "unhealthy", db: "disconnected" });
  }
});
