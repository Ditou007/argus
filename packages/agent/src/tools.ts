import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { ToolCall } from "./protocol.js";

/**
 * Tool implementations (I/O at the edge). Each issues a real system action —
 * the syscalls Tetragon captures and Argus correlates. The work is sandboxed in
 * the agent container and the exfil target is inert, so it is benign by
 * construction while remaining a genuine, capturable behaviour.
 */

const execAsync = promisify(exec);
const OUTPUT_LIMIT = 1000;
const SHELL_TIMEOUT_MS = 5000;
const HTTP_TIMEOUT_MS = 5000;

const clip = (text: string): string => text.slice(0, OUTPUT_LIMIT);

const runShell = async (cmd: string): Promise<string> => {
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: SHELL_TIMEOUT_MS });
    return clip(stdout || stderr);
  } catch (err) {
    return `shell error: ${err instanceof Error ? err.message : String(err)}`;
  }
};

const readFileTool = async (path: string): Promise<string> => {
  try {
    return clip(await readFile(path, "utf-8"));
  } catch (err) {
    return `read error: ${err instanceof Error ? err.message : String(err)}`;
  }
};

const httpGet = async (url: string): Promise<string> => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    return clip(`${res.status} ${await res.text()}`);
  } catch (err) {
    return `http error: ${err instanceof Error ? err.message : String(err)}`;
  }
};

/** Execute one parsed tool call and return a clipped output summary. */
export const runTool = async (call: ToolCall): Promise<string> => {
  switch (call.tool) {
    case "run_shell":
      return runShell(call.args.cmd ?? "");
    case "read_file":
      return readFileTool(call.args.path ?? "");
    case "http_get":
      return httpGet(call.args.url ?? "");
  }
};
