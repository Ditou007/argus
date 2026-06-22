import "dotenv/config";

// Mirrors DEFAULT_TRACE_SETTLE_MS in streaming-service.ts (the service's own
// fallback for direct callers); config always passes a validated value through.
const DEFAULT_TRACE_SETTLE_MS = 60_000;

// A bad ARGUS_TRACE_SETTLE_MS (non-numeric / negative) must NOT become NaN —
// setTimeout(fn, NaN) fires immediately, silently reverting to the zero-traces
// bug Slice 2e fixes. Fall back to the default instead.
const parseSettleMs = (raw: string | undefined): number => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TRACE_SETTLE_MS;
};

/** API service configuration, resolved from environment with dev defaults. */
export const config = {
  port: parseInt(process.env.API_PORT ?? "3001", 10),
  database: {
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    database: process.env.DB_NAME ?? "argus",
    user: process.env.DB_USER ?? "argus",
    password: process.env.DB_PASSWORD ?? "argus_dev",
  },
  redis: {
    host: process.env.REDIS_HOST ?? "localhost",
    // REDIS_PORT is auto-set by K8s to "tcp://..." — use REDIS_PORT_NUMBER instead
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
  // SPEC_04 Slice 2e: grace period before an ended action is finalized, so
  // pipeline-lagged events (event_time→stream ~10–60s) are still attributed.
  traceSettleMs: parseSettleMs(process.env.ARGUS_TRACE_SETTLE_MS),
} as const;
