import pg from "pg";
import { Redis } from "ioredis";
import type { TetragonEvent } from "./types.js";
import { createMigrationRunner } from "./migrations/runner.js";

interface DBConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

interface RedisConfig {
  host: string;
  port: number;
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

export const createEventStore = (dbConfig: DBConfig, redisConfig: RedisConfig) => {
  const pool = new pg.Pool(dbConfig);
  const redis = new Redis(redisConfig);

  redis.on("error", (err: Error) => {
    console.error("Redis pub error:", err.message);
  });

  const initialize = async () => {
    const migrator = createMigrationRunner(pool);
    await migrator.run();
    console.log("Database initialized");
  };

  const insert = async (event: TetragonEvent) => {
    const eventType = getEventType(event);
    const proc = getProcess(event);
    const podName = proc?.pod?.name ?? null;
    const functionName = event.process_kprobe?.function_name ?? null;

    const result = await pool.query(
      `INSERT INTO events (event_type, process_binary, process_pid, function_name, pod_name, pod_namespace, container_id, event_time, raw_event)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        eventType,
        proc?.binary ?? null,
        proc?.pid ?? null,
        functionName,
        podName,
        proc?.pod?.namespace ?? null,
        proc?.pod?.container?.id ?? null,
        getEventTime(event),
        JSON.stringify(event),
      ]
    );

    // Publish lightweight notification to Redis for real-time streaming
    const eventId = result.rows[0]?.id;
    if (eventId && podName) {
      redis.publish("argus:events", JSON.stringify({
        id: eventId,
        event_type: eventType,
        pod_name: podName,
        process_pid: proc?.pid ?? null,
        process_binary: proc?.binary ?? null,
        function_name: functionName,
        event_time: getEventTime(event),
      })).catch(() => {/* non-critical */});
    }
  };

  const close = async () => {
    await redis.quit();
    await pool.end();
  };

  return { initialize, insert, close, pool };
};
