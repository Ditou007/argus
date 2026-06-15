import { describe, it, expect } from "vitest";
import { precisionRecall } from "./metrics.js";
import type { ScoredFixtureEvent } from "./score-fixture.js";

// Hand-computed answer key for the llm_call_decoy fixture:
//   event 1 (tcp_connect, true)  → confidence 1.0
//   event 2 (tcp_sendmsg, true)  → confidence 1.0
//   event 3 (fd_install, decoy)  → confidence 0.481
const scored: ScoredFixtureEvent[] = [
  { event_id: 1, confidence: 1.0, true_match: true },
  { event_id: 2, confidence: 1.0, true_match: true },
  { event_id: 3, confidence: 0.481, true_match: false },
];

describe("precisionRecall", () => {
  it("at threshold 0.3 the decoy is a false positive — precision 2/3, recall 1.0", () => {
    const m = precisionRecall(scored, 0.3);
    expect(m.tp).toBe(2);
    expect(m.fp).toBe(1);
    expect(m.fn).toBe(0);
    expect(m.precision).toBeCloseTo(2 / 3, 5);
    expect(m.recall).toBe(1);
  });

  it("raising the threshold above the decoy restores precision to 1.0", () => {
    const m = precisionRecall(scored, 0.5);
    expect(m.fp).toBe(0);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(1);
  });

  it("defines precision as 1 when nothing is predicted positive", () => {
    const m = precisionRecall(scored, 1.5);
    expect(m.tp).toBe(0);
    expect(m.fp).toBe(0);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(0);
  });
});
