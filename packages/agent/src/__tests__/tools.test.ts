import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTool } from "../tools.js";

let dir: string;
let file: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "argus-tools-"));
  file = join(dir, "note.txt");
  await writeFile(file, "hello-from-disk");
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("runTool", () => {
  it("read_file returns the file contents", async () => {
    expect(await runTool({ tool: "read_file", args: { path: file } })).toContain("hello-from-disk");
  });

  it("read_file returns an error string (not a throw) for a missing file", async () => {
    const out = await runTool({ tool: "read_file", args: { path: "/no/such/file" } });
    expect(out).toMatch(/read error/i);
  });

  it("run_shell runs a safe command and returns its output", async () => {
    expect(await runTool({ tool: "run_shell", args: { cmd: "echo argus" } })).toContain("argus");
  });
});
