import "dotenv/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve paths relative to the monorepo root (3 levels up from this file)
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");

/** Ingestion service configuration, resolved from environment with dev defaults. */
export const config = {
  database: {
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    database: process.env.DB_NAME ?? "argus",
    user: process.env.DB_USER ?? "argus",
    password: process.env.DB_PASSWORD ?? "argus_dev",
  },
  redis: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT_NUMBER ?? "6379", 10),
  },
  clickhouse: {
    url:
      process.env.CLICKHOUSE_URL ??
      `http://${process.env.CLICKHOUSE_HOST ?? "localhost"}:${process.env.CLICKHOUSE_PORT ?? "8123"}`,
    database: process.env.CLICKHOUSE_DB ?? "argus",
    username: process.env.CLICKHOUSE_USER ?? "argus",
    password: process.env.CLICKHOUSE_PASSWORD ?? "argus_dev",
  },
  tetragon: {
    // File mode (docker-compose): tail a JSON log file
    exportPath: process.env.TETRAGON_EXPORT_PATH ?? resolve(repoRoot, "data/tetragon/tetragon.log"),
    // gRPC mode (K8s): connect to Tetragon gRPC service
    grpcAddress: process.env.TETRAGON_GRPC_ADDRESS ?? "localhost:54321",
    // Toggle: "file" for docker-compose, "grpc" for K8s
    mode: (process.env.TETRAGON_MODE ?? "file") as "file" | "grpc",
  },
} as const;
