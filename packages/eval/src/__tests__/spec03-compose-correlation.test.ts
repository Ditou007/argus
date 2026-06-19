import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_CORRELATION_CONFIG } from "@argus/api/correlation/config";
import { parseFixture } from "../fixture.js";
import { scoreFixture } from "../score-fixture.js";

// SPEC_03 Slice 2 / T2 — compose-mode correlation via `pid: host`.
// In raw docker-compose there is no Kubernetes pod metadata, so events carry
// pod_name = null and the agent runs with the host PID namespace (`pid: host`),
// reporting its host PID via the SDK. The correlator therefore keys on the host
// PID, and process-identity exact-match (1.0) does the decisive work — the same
// reliability SPEC_02 demoted for the container-PID gap (D15), recovered here
// because the host PID *is* the SDK-reported PID. This is a deployment-mode
// guarantee, not a scoring change: this fixture pins it through the real engine.
const fixture = parseFixture(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../fixtures/spec03_compose_pidhost.json", import.meta.url)),
      "utf8"
    )
  )
);

const { bands, discardThreshold } = DEFAULT_CORRELATION_CONFIG;

describe("SPEC_03 Slice 2 — compose-mode correlation (pid:host)", () => {
  it("attributes the agent's own host-PID syscalls at HIGH confidence", () => {
    const scored = scoreFixture(fixture);
    const trueMatches = scored.filter((s) => s.true_match);

    expect(trueMatches.length).toBeGreaterThan(0);
    for (const match of trueMatches) {
      expect(match.confidence).toBeGreaterThanOrEqual(bands.high);
    }
  });

  it("scores an identical syscall from a different host PID well below the agent's own", () => {
    const scored = scoreFixture(fixture);
    const crossProcess = scored.filter((s) => !s.true_match);

    // NOTE ON MECHANISM: in production the cross-process syscall is never even a
    // candidate — the correlator's candidate query keys on the agent's host PID
    // (see candidate-query.test.ts), so a foreign PID is excluded before scoring.
    // This scorer-level assertion shows the *complementary* fact: exact host-PID
    // identity is the decisive signal — it lifts the agent's own syscalls to
    // ~0.91/0.95 (HIGH) while the same syscall lacking it scores ~0.61.
    expect(crossProcess.length).toBeGreaterThan(0);
    for (const event of crossProcess) {
      expect(event.confidence).toBeCloseTo(0.61, 1); // ~0.61, comfortably below HIGH (0.7)
      expect(event.confidence).toBeLessThan(bands.high);
    }
  });

  it("correlates every true-match syscall above the discard threshold", () => {
    const scored = scoreFixture(fixture);
    for (const match of scored.filter((s) => s.true_match)) {
      expect(match.confidence).toBeGreaterThanOrEqual(discardThreshold);
    }
  });
});
