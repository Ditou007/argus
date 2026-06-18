import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveFdPaths } from "@argus/api/correlation/fd-path";

/**
 * SPEC_02 Slice 6 (D14) — write fd→path resolution, verified on REAL captured
 * events (a kind+Tetragon re-capture under the fd-as-int policy). This is the
 * reproducible counterpart to the live correlator numbers in the spec.
 */
const events = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../fixtures/spec02/d14-write-resolution.json", import.meta.url)), "utf8")
);

describe("D14 write fd→path on real captured data", () => {
  const resolved = resolveFdPaths(events);

  it("the capture has writes that previously carried no path", () => {
    const writes = events.filter((e: { function_name: string | null }) => /sys_write/.test(e.function_name ?? ""));
    expect(writes.length).toBeGreaterThan(0);
  });

  it("resolves real sys_write events to their checkpoint file paths", () => {
    expect(resolved.size).toBeGreaterThan(0);
    expect([...resolved.values()].some((p) => p.includes("checkpoint"))).toBe(true);
  });
});
