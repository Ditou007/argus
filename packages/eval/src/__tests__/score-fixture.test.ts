import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFixture } from "../fixture.js";
import { scoreFixture } from "../score-fixture.js";

const fixture = parseFixture(
  JSON.parse(
    readFileSync(fileURLToPath(new URL("../../fixtures/llm_call_decoy.json", import.meta.url)), "utf8")
  )
);

describe("scoreFixture (real engine, no I/O)", () => {
  it("scores every event and carries its label through", () => {
    const scored = scoreFixture(fixture);
    expect(scored).toHaveLength(3);
    expect(scored.map((s) => s.event_id).sort()).toEqual([1, 2, 3]);
  });

  it("scores the true network syscalls at full confidence", () => {
    const scored = scoreFixture(fixture);
    const byId = new Map(scored.map((s) => [s.event_id, s]));
    expect(byId.get(1)?.confidence).toBe(1);
    expect(byId.get(2)?.confidence).toBe(1);
  });

  it("scores the same-PID in-window fd_install decoy at ~0.48 (the over-scoring we must surface)", () => {
    const scored = scoreFixture(fixture);
    const decoy = scored.find((s) => s.event_id === 3);
    expect(decoy?.true_match).toBe(false);
    expect(decoy?.confidence).toBeCloseTo(0.481, 3);
  });

  it("is deterministic — two runs are identical", () => {
    expect(scoreFixture(fixture)).toEqual(scoreFixture(fixture));
  });
});
