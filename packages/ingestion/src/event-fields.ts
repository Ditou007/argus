import type { TetragonEvent, ProcessInfo } from "./types.js";

// Tetragon serializes an absent/object time field as this literal; treat it as "no time".
const PLACEHOLDER_TIME = "[object Object]";

/**
 * Classify a Tetragon event by which payload it carries.
 * @function getEventType
 * @param event - the raw Tetragon event
 * @returns the event-type tag (`process_exec` | `process_exit` | `process_kprobe` | `unknown`)
 */
export const getEventType = (event: TetragonEvent): string => {
  if (event.process_exec) return "process_exec";
  if (event.process_exit) return "process_exit";
  if (event.process_kprobe) return "process_kprobe";
  return "unknown";
};

/**
 * Extract the process descriptor regardless of the event payload variant.
 * @function getProcess
 * @param event - the raw Tetragon event
 * @returns the process info, or null if none is present
 */
export const getProcess = (event: TetragonEvent): ProcessInfo | null =>
  event.process_exec?.process ??
  event.process_exit?.process ??
  event.process_kprobe?.process ??
  null;

/**
 * The actual syscall time: prefer the top-level `time` (when the event fired)
 * over process.start_time (when the process started).
 * @function getEventTime
 * @param event - the raw Tetragon event
 * @returns an ISO timestamp string, or null if none can be determined
 */
export const getEventTime = (event: TetragonEvent): string | null => {
  if (event.time && typeof event.time === "string" && event.time !== PLACEHOLDER_TIME) {
    return event.time;
  }
  const proc = getProcess(event);
  if (proc?.start_time && typeof proc.start_time === "string") {
    return proc.start_time;
  }
  return null;
};

// The common projection of a Tetragon event onto the columns both stores share.
export interface EventFields {
  readonly event_type: string;
  readonly process_binary: string | null;
  readonly process_pid: number | null;
  readonly function_name: string | null;
  readonly pod_name: string | null;
  readonly pod_namespace: string | null;
  readonly container_id: string | null;
  readonly event_time: string | null;
}

type ProcFields = Pick<EventFields, "process_binary" | "process_pid">;
type PodFields = Pick<EventFields, "pod_name" | "pod_namespace" | "container_id">;

const NO_POD: PodFields = { pod_name: null, pod_namespace: null, container_id: null };

const procFields = (proc: ProcessInfo | null): ProcFields => ({
  process_binary: proc?.binary ?? null,
  process_pid: proc?.pid ?? null,
});

const podFields = (proc: ProcessInfo | null): PodFields => {
  const pod = proc?.pod;
  if (!pod) return NO_POD;
  return {
    pod_name: pod.name,
    pod_namespace: pod.namespace,
    container_id: pod.container?.id ?? null,
  };
};

/**
 * Project a Tetragon event onto the column set both the Postgres and ClickHouse
 * stores share, so the two write paths stay in lock-step.
 * @function toEventFields
 * @param event - the raw Tetragon event
 * @returns the shared column projection (nullable fields where data is absent)
 */
export const toEventFields = (event: TetragonEvent): EventFields => {
  const proc = getProcess(event);
  return {
    event_type: getEventType(event),
    function_name: event.process_kprobe?.function_name ?? null,
    event_time: getEventTime(event),
    ...procFields(proc),
    ...podFields(proc),
  };
};
