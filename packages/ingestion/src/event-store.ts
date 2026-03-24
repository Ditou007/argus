import pg from "pg";
import type { TetragonEvent } from "./types.js";
import { createMigrationRunner } from "./migrations/runner.js";

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

// Extract the actual event timestamp from the Tetragon event
const getEventTime = (event: TetragonEvent): string | null => {
  // Prefer the top-level time field — this is when the syscall happened
  // (process.start_time is when the process started, NOT when the event fired)
  if (event.time && typeof event.time === "string" && event.time !== "[object Object]") {
    return event.time;
  }
  // Fall back to process start_time
  const proc = getProcess(event);
  if (proc?.start_time && typeof proc.start_time === "string") {
    return proc.start_time;
  }
  return null;
};

export const createEventStore = (dbConfig: DBConfig) => {
  const pool = new pg.Pool(dbConfig);

  const initialize = async () => {
    const migrator = createMigrationRunner(pool);
    await migrator.run();
    console.log("Database initialized");
  };

  const insert = async (event: TetragonEvent) => {
    const eventType = getEventType(event);
    const proc = getProcess(event);

    await pool.query(
      `INSERT INTO events (event_type, process_binary, process_pid, function_name, pod_name, pod_namespace, container_id, event_time, raw_event)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        eventType,
        proc?.binary ?? null,
        proc?.pid ?? null,
        event.process_kprobe?.function_name ?? null,
        proc?.pod?.name ?? null,
        proc?.pod?.namespace ?? null,
        proc?.pod?.container?.id ?? null,
        getEventTime(event),
        JSON.stringify(event),
      ]
    );
  };

  const close = async () => {
    await pool.end();
  };

  return { initialize, insert, close, pool };
};
