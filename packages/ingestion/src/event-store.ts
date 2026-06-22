import pg from "pg";
import { Redis } from "ioredis";
import type { TetragonEvent } from "./types.js";
import { createMigrationRunner } from "./migrations/runner.js";
import { toEventFields } from "./event-fields.js";
import { createStreamPublisher } from "./stream-publisher.js";

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

/**
 * Build the Postgres-backed event store with a Redis live-stream publisher.
 * @function createEventStore
 * @param dbConfig - Postgres connection settings
 * @param redisConfig - Redis connection settings for live-stream publish
 * @returns the store API: initialize (migrations), insert (one event), close, and the pool
 */
export const createEventStore = (dbConfig: DBConfig, redisConfig: RedisConfig) => {
  const pool = new pg.Pool(dbConfig);
  const redis = new Redis(redisConfig);
  // SPEC_04 Slice 2b: durable stream feeding the streaming correlator (ADR 0002).
  const streamPublisher = createStreamPublisher(redis);

  redis.on("error", (err: Error) => {
    console.error("Redis pub error:", err.message);
  });

  const initialize = async () => {
    const migrator = createMigrationRunner(pool);
    await migrator.run();
    console.log("Database initialized");
  };

  const insert = async (event: TetragonEvent) => {
    const fields = toEventFields(event);

    const result = await pool.query(
      `INSERT INTO events (event_type, process_binary, process_pid, function_name, pod_name, pod_namespace, container_id, event_time, raw_event)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        fields.event_type,
        fields.process_binary,
        fields.process_pid,
        fields.function_name,
        fields.pod_name,
        fields.pod_namespace,
        fields.container_id,
        fields.event_time,
        JSON.stringify(event),
      ]
    );

    // Publish lightweight notification to Redis for real-time streaming
    const eventId = result.rows[0]?.id;
    if (eventId && fields.pod_name) {
      redis.publish("argus:events", JSON.stringify({
        id: eventId,
        event_type: fields.event_type,
        pod_name: fields.pod_name,
        process_pid: fields.process_pid,
        process_binary: fields.process_binary,
        function_name: fields.function_name,
        event_time: fields.event_time,
      })).catch(() => {/* non-critical */});
    }

    // Publish the FULL event to the durable stream for the streaming correlator.
    // For ALL ingested events (not just pod-scoped) — compose mode is pid-scoped.
    // Additive: a stream failure must not break ingestion.
    if (eventId) {
      streamPublisher.publish(event, eventId).catch(() => {/* non-critical, additive */});
    }
  };

  const close = async () => {
    await redis.quit();
    await pool.end();
  };

  return { initialize, insert, close, pool };
};
