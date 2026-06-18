/**
 * Resource extraction from raw Tetragon events — the file path or network
 * destination a syscall touched. Shared by the `file_path` / `network_destination`
 * signals and by risk scoring, so the kprobe-arg parsing lives in exactly one place.
 */

type Raw = Record<string, unknown>;

const kprobeArgs = (raw: Raw): Array<Record<string, unknown>> | null => {
  const kprobe = (raw.process_kprobe as Raw) ?? (raw.processKprobe as Raw);
  const args = kprobe?.args as Array<Record<string, unknown>> | undefined;
  return args ?? null;
};

/**
 * Extract a file path from a raw kprobe event's args (gRPC `fileArg` or JSON `file_arg`).
 * @function extractFilePath
 * @param raw - The raw Tetragon event.
 * @returns The path, or null when there is no file arg.
 */
export const extractFilePath = (raw: Raw): string | null => {
  const args = kprobeArgs(raw);
  if (!args) return null;
  for (const arg of args) {
    const fileArg = (arg.fileArg ?? arg.file_arg) as Raw | undefined;
    if (fileArg && fileArg.path) return String(fileArg.path);
  }
  return null;
};

/** A network destination extracted from a socket arg. */
export interface SockDestination {
  readonly daddr: string;
  readonly dport: number;
}

/**
 * Extract the destination socket from a raw kprobe event's args (`sockArg`/`sock_arg`).
 * @function extractSockArg
 * @param raw - The raw Tetragon event.
 * @returns The destination, or null when there is no socket arg.
 */
export const extractSockArg = (raw: Raw): SockDestination | null => {
  const args = kprobeArgs(raw);
  if (!args) return null;
  for (const arg of args) {
    const sock = (arg.sockArg ?? arg.sock_arg) as Raw | undefined;
    if (sock && sock.daddr) {
      return { daddr: String(sock.daddr), dport: Number(sock.dport ?? 0) };
    }
  }
  return null;
};

/**
 * Extract the first integer arg from a raw kprobe event (`intArg`/`int_arg`) —
 * e.g. the file descriptor on `fd_install` / `sys_write`.
 * @function extractFd
 * @param raw - The raw Tetragon event.
 * @returns The integer, or null when there is no int arg.
 */
export const extractFd = (raw: Raw): number | null => {
  const args = kprobeArgs(raw);
  if (!args) return null;
  for (const arg of args) {
    const v = (arg.intArg ?? arg.int_arg) as unknown;
    if (typeof v === "number") return v;
  }
  return null;
};

/** The resource a syscall touched — a file, a network destination, or neither. */
export type ResourceRef =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "network"; readonly daddr: string; readonly dport: number }
  | { readonly kind: "other" };

/**
 * Classify the resource a raw event touched, preferring a file path then a socket.
 * @function extractResource
 * @param raw - The raw Tetragon event.
 * @returns A {@link ResourceRef}.
 */
export const extractResource = (raw: Raw): ResourceRef => {
  const path = extractFilePath(raw);
  if (path) return { kind: "file", path };
  const sock = extractSockArg(raw);
  if (sock) return { kind: "network", daddr: sock.daddr, dport: sock.dport };
  return { kind: "other" };
};
