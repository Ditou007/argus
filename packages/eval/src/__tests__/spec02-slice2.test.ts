import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * SPEC_02 — Slice 2 (T1a + T1b): pod-scoped capture completeness, VERIFIED on a
 * real re-capture. This is the counterpart to spec02-baseline.test.ts: where the
 * baseline pinned the broken state, this asserts the fix on fresh real data —
 * the agent's spawned `sh`/`curl` tree is now ingested AND curl's exfil
 * `tcp_connect` is captured (both were invisible before).
 */
const cap = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../fixtures/spec02/postfix-capture-slice2.json", import.meta.url)), "utf8")
);

describe("SPEC_02 Slice 2 — pod-scoped capture (post-fix)", () => {
  describe("T1a — event-filter ingests the whole agent process tree", () => {
    it("ingested sh AND curl exec (baseline had ZERO)", () => {
      expect(cap.sh_curl_exec_ingested_count).toBeGreaterThanOrEqual(2);
      const bins = Object.keys(cap.ingested_process_exec_binaries);
      expect(bins.some((b: string) => b.endsWith("/sh"))).toBe(true);
      expect(bins.some((b: string) => b.includes("curl"))).toBe(true);
    });

    it("still ingests the agent's own python (didn't lose the original signal)", () => {
      expect(Object.keys(cap.ingested_process_exec_binaries).some((b) => b.includes("python"))).toBe(true);
    });
  });

  describe("T1b — TracingPolicy captures the spawned tool's kernel behaviour", () => {
    it("captured curl's tcp_connect (baseline had ZERO curl kprobes)", () => {
      expect(cap.curl_kprobes_captured.tcp_connect).toBeGreaterThanOrEqual(1);
    });

    it("the captured exfil connect carries the real destination socket", () => {
      const args = cap.sample_exfil_connect_raw?.process_kprobe?.args ?? [];
      const sock = args.find((a: { sockArg?: unknown }) => a.sockArg)?.sockArg;
      expect(sock).toBeTruthy();
      expect(sock.daddr).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      expect(sock.dport).toBeGreaterThan(0);
    });
  });
});
