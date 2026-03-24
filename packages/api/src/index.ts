import express from "express";
import cors from "cors";
import pg from "pg";
import { createEventsRouter } from "./routes/events.js";
import { createHealthRouter } from "./routes/health.js";
import { createSessionsRouter } from "./routes/sessions.js";
import { config } from "./config.js";

const app = express();
const pool = new pg.Pool(config.database);

app.use(cors());
app.use(express.json());

app.use("/api/health", createHealthRouter(pool));
app.use("/api/events", createEventsRouter(pool));
app.use("/api/sessions", createSessionsRouter(pool));

const server = app.listen(config.port, () => {
  console.log(`Argus API running on port ${config.port}`);
});

const shutdown = async () => {
  console.log("Shutting down API...");
  server.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { pool };
