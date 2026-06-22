import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { TetragonEvent, ProcessInfo } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Proto files are at packages/ingestion/proto/ relative to the build output
// In dev (tsx): src/ -> proto/ is ../proto
// In build (dist/): dist/ -> proto/ would need to be copied
// We resolve from the package root
const PROTO_DIR = resolve(__dirname, "..", "proto");
const SENSORS_PROTO = resolve(PROTO_DIR, "tetragon", "sensors.proto");

interface GrpcWatcherOptions {
  grpcAddress: string;
  onEvent: (event: TetragonEvent) => Promise<void>;
}

// Extract a numeric value from a gRPC wrapper (UInt32Value) or plain number
const unwrapNumber = (val: unknown): number => {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val !== null && "value" in val) return Number((val as { value: unknown }).value);
  return Number(val) || 0;
};

// Extract a string from a gRPC Timestamp or plain string
// Preserves nanosecond precision from protobuf Timestamps
const unwrapTimestamp = (val: unknown): string => {
  if (typeof val === "string") return val;
  if (val == null) return "";
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    // gRPC Timestamp has seconds + nanos fields
    if ("seconds" in obj) {
      const seconds = Number(obj.seconds);
      const nanos = Number(obj.nanos ?? 0);
      // Build ISO string with microsecond precision
      const ms = Math.floor(nanos / 1_000_000);
      const us = Math.floor((nanos % 1_000_000) / 1_000);
      const date = new Date(seconds * 1000 + ms);
      // Append microseconds for PostgreSQL TIMESTAMPTZ precision
      const iso = date.toISOString();
      return iso.replace("Z", `${String(us).padStart(3, "0")}Z`);
    }
  }
  return String(val);
};

// Extract pod info from gRPC Process object into our flat format
const extractProcess = (proc: Record<string, unknown> | undefined): ProcessInfo | undefined => {
  if (!proc) return undefined;

  const pod = proc.pod as Record<string, unknown> | undefined;
  const container = pod?.container as Record<string, unknown> | undefined;

  return {
    exec_id: String(proc.execId ?? proc.exec_id ?? ""),
    pid: unwrapNumber(proc.pid),
    uid: unwrapNumber(proc.uid),
    cwd: String(proc.cwd ?? ""),
    binary: String(proc.binary ?? ""),
    arguments: proc.arguments ? String(proc.arguments) : undefined,
    start_time: unwrapTimestamp(proc.startTime ?? proc.start_time),
    pod: pod
      ? {
          namespace: String(pod.namespace ?? ""),
          name: String(pod.name ?? ""),
          container: container
            ? {
                id: String(container.id ?? ""),
                name: String(container.name ?? ""),
              }
            : undefined,
        }
      : undefined,
  };
};

// Convert a gRPC event response into our TetragonEvent shape
const toTetragonEvent = (response: Record<string, unknown>): TetragonEvent | null => {
  const nodeName = String(response.nodeName ?? response.node_name ?? "");
  const time = response.time ? unwrapTimestamp(response.time) : new Date().toISOString();

  const processExec = response.processExec ?? response.process_exec;
  const processExit = response.processExit ?? response.process_exit;
  const processKprobe = response.processKprobe ?? response.process_kprobe;

  if (processExec) {
    const exec = processExec as Record<string, unknown>;
    return {
      node_name: nodeName,
      time,
      process_exec: {
        process: extractProcess(exec.process as Record<string, unknown>)!,
        parent: extractProcess(exec.parent as Record<string, unknown>),
      },
    };
  }

  if (processExit) {
    const exit = processExit as Record<string, unknown>;
    return {
      node_name: nodeName,
      time,
      process_exit: {
        process: extractProcess(exit.process as Record<string, unknown>)!,
        parent: extractProcess(exit.parent as Record<string, unknown>),
        signal: exit.signal ? String(exit.signal) : undefined,
        status: exit.status ? Number(exit.status) : undefined,
      },
    };
  }

  if (processKprobe) {
    const kprobe = processKprobe as Record<string, unknown>;
    return {
      node_name: nodeName,
      time,
      process_kprobe: {
        process: extractProcess(kprobe.process as Record<string, unknown>)!,
        parent: extractProcess(kprobe.parent as Record<string, unknown>),
        function_name: String(kprobe.functionName ?? kprobe.function_name ?? ""),
        args: kprobe.args as Array<{ string_arg?: string; int_arg?: number; file_arg?: { path: string } }> | undefined,
      },
    };
  }

  return null;
};

/** The minimal readable-stream surface the backpressure pump drives. */
export interface PausableStream {
  on: (event: "data", listener: (data: unknown) => void) => void;
  pause: () => void;
  resume: () => void;
}

/**
 * Wire a readable stream's `data` events to an async handler WITH backpressure:
 * pause the stream while each handler runs and resume only once it settles, so a
 * slow consumer (per-event DB write) can never pile up unbounded in-flight
 * handlers in the microtask queue — the gRPC analogue of the file-watcher OOM
 * (finding #5). `isRunning` gates resume so a stopped watcher doesn't restart flow.
 * @function pumpWithBackpressure
 * @param stream - the readable stream (gRPC server-stream, or a fake in tests)
 * @param handle - async per-event handler (must not reject; errors handled inside)
 * @param isRunning - whether the watcher is still active
 */
export const pumpWithBackpressure = (
  stream: PausableStream,
  handle: (data: unknown) => Promise<void>,
  isRunning: () => boolean
): void => {
  stream.on("data", (data: unknown) => {
    if (!isRunning()) return;
    stream.pause();
    void handle(data).finally(() => {
      if (isRunning()) stream.resume();
    });
  });
};

/**
 * Build the gRPC Tetragon watcher (K8s mode): connects to the Tetragon
 * GetEvents server stream, converts each event, and feeds `onEvent` with
 * backpressure (see {@link pumpWithBackpressure}). Reconnects with exponential
 * backoff on error/end.
 * @function createGrpcWatcher
 * @param options - gRPC address + the async onEvent sink
 * @returns the watcher API: start, stop
 */
export const createGrpcWatcher = (options: GrpcWatcherOptions) => {
  const { grpcAddress, onEvent } = options;
  let running = false;
  let eventCount = 0;
  let call: grpc.ClientReadableStream<unknown> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const loadClient = () => {
    const packageDefinition = protoLoader.loadSync(SENSORS_PROTO, {
      keepCase: false,         // Convert snake_case to camelCase
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [PROTO_DIR],
    });

    const proto = grpc.loadPackageDefinition(packageDefinition);

    // Navigate to the service: tetragon.sensors.FineGuidanceSensors
    const tetragonPkg = proto.tetragon as Record<string, unknown>;
    const FineGuidanceSensors = tetragonPkg.FineGuidanceSensors as unknown as new (
      address: string,
      credentials: grpc.ChannelCredentials,
    ) => grpc.Client & { GetEvents: (request: Record<string, unknown>) => grpc.ClientReadableStream<unknown> };

    return new FineGuidanceSensors(grpcAddress, grpc.credentials.createInsecure());
  };

  const connect = (client: ReturnType<typeof loadClient>, retryCount = 0) => {
    if (!running) return;

    console.log(`Connecting to Tetragon gRPC at ${grpcAddress}...`);

    // GetEvents is a server-streaming RPC
    call = (client as unknown as Record<string, CallableFunction>).GetEvents({
      // Empty request = get all events. Filtering is done in our event-filter.
      allowList: [],
      denyList: [],
    }) as grpc.ClientReadableStream<unknown>;

    // Backpressure: pause the stream while each event is written, so a slow DB
    // can't pile up unbounded in-flight handlers (the OOM class fixed for the
    // file watcher in finding #5).
    const handleEvent = async (response: unknown): Promise<void> => {
      try {
        const event = toTetragonEvent(response as Record<string, unknown>);
        if (event) {
          await onEvent(event);
          eventCount++;
          if (eventCount % 100 === 0) {
            console.log(`gRPC: ${eventCount} events received`);
          }
        }
      } catch (err) {
        console.error("Error processing gRPC event:", err);
      }
    };
    pumpWithBackpressure(call, handleEvent, () => running);

    call.on("error", (err: Error) => {
      if (!running) return;
      console.error(`Tetragon gRPC error: ${err.message}`);
      scheduleReconnect(client, retryCount + 1);
    });

    call.on("end", () => {
      if (!running) return;
      console.log("Tetragon gRPC stream ended, reconnecting...");
      scheduleReconnect(client, 0);
    });

    // Reset retry count on successful connection
    call.on("metadata", () => {
      console.log("Connected to Tetragon gRPC");
    });
  };

  const scheduleReconnect = (client: ReturnType<typeof loadClient>, retryCount: number) => {
    if (!running) return;
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
    console.log(`Reconnecting in ${delay / 1000}s...`);
    reconnectTimer = setTimeout(() => connect(client, retryCount), delay);
  };

  const start = () => {
    running = true;
    const client = loadClient();
    connect(client);
  };

  const stop = () => {
    running = false;
    if (call) {
      call.cancel();
      call = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    console.log(`gRPC watcher stopped. Processed ${eventCount} events.`);
  };

  return { start, stop };
};
