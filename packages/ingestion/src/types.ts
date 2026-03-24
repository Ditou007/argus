export interface TetragonEvent {
  process_exec?: ProcessExecEvent;
  process_exit?: ProcessExitEvent;
  process_kprobe?: KprobeEvent;
  node_name: string;
  time: string;
}

export interface ProcessExecEvent {
  process: ProcessInfo;
  parent?: ProcessInfo;
}

export interface ProcessExitEvent {
  process: ProcessInfo;
  parent?: ProcessInfo;
  signal?: string;
  status?: number;
}

export interface KprobeEvent {
  process: ProcessInfo;
  parent?: ProcessInfo;
  function_name: string;
  args?: KprobeArg[];
}

export interface PodInfo {
  namespace: string;
  name: string;
  container?: {
    id: string;
    name: string;
  };
}

export interface ProcessInfo {
  exec_id: string;
  pid: number;
  uid: number;
  cwd: string;
  binary: string;
  arguments?: string;
  start_time: string;
  pod?: PodInfo; // Present when Tetragon runs in K8s
}

export interface KprobeArg {
  string_arg?: string;
  int_arg?: number;
  file_arg?: { path: string };
  sock_arg?: {
    family: string;
    type: string;
    protocol: string;
    saddr: string;
    daddr: string;
    sport: number;
    dport: number;
  };
}

export interface StoredEvent {
  id: number;
  event_type: string;
  process_binary: string;
  process_pid: number;
  function_name: string | null;
  pod_name: string | null;
  pod_namespace: string | null;
  container_id: string | null;
  raw_event: TetragonEvent;
  created_at: Date;
}
