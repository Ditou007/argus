import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * SPEC_02 — Slice 1 (T0): baseline real-data capture & gap characterisation.
 *
 * This test pins the three capture gaps that SPEC_02 fixes, against a frozen
 * corpus from a real kind+Tetragon capture (long_running_agent.py, 15 cycles,
 * real Groq calls). It is a CHARACTERISATION test: it documents the broken
 * present state so later slices (T1/T3/T4) flip these assertions when they
 * land and the corpus is re-captured.
 */
const capture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/spec02/baseline-capture.json", import.meta.url)), "utf8")
);

describe("SPEC_02 baseline capture (T0)", () => {
  it("captured a real, long-running session", () => {
    expect(capture.session_id).toMatch(/[0-9a-f-]{36}/);
    expect(capture.kernel_ground_truth.process_exec_tree.length).toBeGreaterThan(0);
  });

  describe("Gap A — process tree (fixed by T1)", () => {
    const tree = capture.kernel_ground_truth.process_exec_tree as Array<{ binary: string }>;

    it("the kernel saw the agent's spawned sh + curl exfil chain", () => {
      expect(tree.some((p) => p.binary.endsWith("/sh"))).toBe(true);
      expect(tree.some((p) => p.binary.includes("curl"))).toBe(true);
    });

    it("but Argus ingested ZERO sh/curl exec — the binary allowlist broke the tree", () => {
      expect(capture.argus_ingested.sh_curl_exec_ingested_count).toBe(0);
      // Only the agent's own python exec survives the allowlist.
      expect(Object.keys(capture.argus_ingested.process_exec_binaries)).toEqual([
        "/usr/local/bin/python",
      ]);
    });
  });

  describe("Gap B — write path (fixed by T3/D14)", () => {
    it("write events carry only a byte count, no fd/path", () => {
      const raw = capture.argus_ingested.sample_write_event_raw;
      const args = JSON.stringify(raw);
      expect(args).toContain("sizeArg");
      expect(args).not.toMatch(/id_rsa|credentials|\.json|\/tmp\//);
    });
  });

  describe("Gap C — identity PID (fixed by T4/D15)", () => {
    it("the SDK's declared PID is the container PID 1, absent from the event host PIDs", () => {
      expect(capture.agent.declared_pid_via_sdk).toBe(1);
      expect(capture.agent.host_pids_in_events).not.toContain(1);
      expect(capture.agent.host_pids_in_events.length).toBeGreaterThan(0);
    });
  });
});
