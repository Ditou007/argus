/**
 * fd → path resolution for write attribution (SPEC_02 D14). A `sys_write` event
 * carries only the file descriptor (a number), not a path — so on its own a
 * write can't be tied to a file. But `fd_install` carries `fd → path`. Walking a
 * session's events in time order, we track each process's open fds and resolve
 * every write's fd back to the path it was opened on.
 */
import { extractFd, extractFilePath } from "./resource.js";
import { normalizeSyscall } from "./syscall.js";

/** Minimal event shape the resolver needs. */
export interface FdPathEvent {
  readonly id: number;
  readonly process_pid: number;
  readonly function_name: string | null;
  readonly raw_event: Record<string, unknown>;
}

const FD_INSTALL = "fd_install";
const SYS_WRITE = "sys_write";

/**
 * Resolve each write event to the file path its fd was opened on.
 * @function resolveFdPaths
 * @param events - The session's events, in time order (fd_install before the writes that use it).
 * @returns Map of write event id → resolved file path (only writes that resolve).
 */
export const resolveFdPaths = (events: readonly FdPathEvent[]): Map<number, string> => {
  const fdToPath = new Map<string, string>(); // `${pid}:${fd}` → path
  const resolved = new Map<number, string>(); // write event id → path

  for (const e of events) {
    const fn = normalizeSyscall(e.function_name);
    const fd = extractFd(e.raw_event);
    if (fd === null) continue;
    const key = `${e.process_pid}:${fd}`;

    if (fn === FD_INSTALL) {
      const path = extractFilePath(e.raw_event);
      if (path) fdToPath.set(key, path);
    } else if (fn === SYS_WRITE) {
      const path = fdToPath.get(key);
      if (path) resolved.set(e.id, path);
    }
  }
  return resolved;
};

/**
 * Return a copy of a raw event with a synthetic `fileArg` carrying the resolved
 * path, so the `file_path` signal's `extractFilePath` attributes the write to a
 * file. Immutable — the input is not mutated.
 * @function injectResolvedPath
 * @param raw - The raw write event.
 * @param path - The resolved file path.
 * @returns A new raw event carrying the path.
 */
export const injectResolvedPath = (
  raw: Record<string, unknown>,
  path: string
): Record<string, unknown> => {
  const kprobe = (raw.process_kprobe ?? raw.processKprobe) as Record<string, unknown> | undefined;
  const args = ((kprobe?.args as unknown[]) ?? []).slice();
  return { ...raw, process_kprobe: { ...(kprobe ?? {}), args: [...args, { fileArg: { path } }] } };
};
