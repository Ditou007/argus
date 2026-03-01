import pg from "pg";
import type { TetragonEvent } from "./types.js";

interface DBConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export class EventStore {
  private pool: pg.Pool;

  constructor(config: DBConfig) {
    this.pool = new pg.Pool(config);
  }

  async initialize() {
    await this.pool.query(`
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
  }

  async insert(event: TetragonEvent) {
    const eventType = this.getEventType(event);
    const process = this.getProcess(event);

    await this.pool.query(
      `INSERT INTO events (event_type, process_binary, process_pid, function_name, raw_event)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        eventType,
        process?.binary ?? null,
        process?.pid ?? null,
        event.process_kprobe?.function_name ?? null,
        JSON.stringify(event),
      ]
    );
  }

  async close() {
    await this.pool.end();
  }

  private getEventType(event: TetragonEvent): string {
    if (event.process_exec) return "process_exec";
    if (event.process_exit) return "process_exit";
    if (event.process_kprobe) return "process_kprobe";
    return "unknown";
  }

  private getProcess(event: TetragonEvent) {
    return (
      event.process_exec?.process ??
      event.process_exit?.process ??
      event.process_kprobe?.process ??
      null
    );
  }
}
