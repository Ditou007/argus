import { Router, type IRouter } from "express";
import type pg from "pg";

export const createHealthRouter = (pool: pg.Pool): IRouter => {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "healthy", service: "argus-api", db: "connected" });
    } catch {
      res.status(503).json({ status: "unhealthy", db: "disconnected" });
    }
  });

  return router;
};
