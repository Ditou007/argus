import pg from "pg";
import type { TetragonEvent } from "./types.js";

interface DBConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

const getEventType = (event: TetragonEvent): string => {
  if (event.process_exec) return "process_exec";
  if (event.process_exit) return "process_exit";
  if (event.process_kprobe) return "process_kprobe";
  return "unknown";
};

const getProcess = (event: TetragonEvent) =>
  event.process_exec?.process ??
  event.process_exit?.process ??
  event.process_kprobe?.process ??
  null;

export const createEventStore = (dbConfig: DBConfig) => {
  const pool = new pg.Pool(dbConfig);

  const initialize = async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        process_binary VARCHAR(512),
        process_pid INTEGER,
        function_name VARCHAR(256),
        raw_event JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type);
      CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);
      CREATE INDEX IF NOT EXISTS idx_events_binary ON events (process_binary);
    `);

    console.log("📦 Database initialized");
  };

  const insert = async (event: TetragonEvent) => {
    const eventType = getEventType(event);
    const proc = getProcess(event);

    await pool.query(
      `INSERT INTO events (event_type, process_binary, process_pid, function_name, raw_event)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        eventType,
        proc?.binary ?? null,
        proc?.pid ?? null,
        event.process_kprobe?.function_name ?? null,
        JSON.stringify(event),
      ]
    );
  };

  const close = async () => {
    await pool.end();
  };

  return { initialize, insert, close };
};
