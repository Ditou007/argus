import { describe, it, expect } from "vitest";
import { detectUnexplained } from "./unexplained.js";

describe("detectUnexplained", () => {
  const THRESHOLD = 0.7;

  it("flags an event with no correlation at or above the threshold to any action", () => {
    // event 99 = an unreported /etc/passwd read: weakly correlated everywhere
    const unexplained = detectUnexplained(
      [1, 99],
      [
        { event_id: 1, confidence: 0.9 }, // reported, strongly correlated
        { event_id: 99, confidence: 0.2 }, // unreported, below threshold
      ],
      THRESHOLD
    );
    expect(unexplained).toEqual([99]);
  });

  it("does not flag an event explained by at least one action (uses the max across actions)", () => {
    // event 5 correlates weakly to one action but strongly to another → explained
    const unexplained = detectUnexplained(
      [5],
      [
        { event_id: 5, confidence: 0.3 },
        { event_id: 5, confidence: 0.85 },
      ],
      THRESHOLD
    );
    expect(unexplained).toEqual([]);
  });

  it("treats a confidence exactly at the threshold as explained", () => {
    expect(detectUnexplained([7], [{ event_id: 7, confidence: 0.7 }], THRESHOLD)).toEqual([]);
  });

  it("flags an event that has no correlations at all", () => {
    expect(detectUnexplained([42], [], THRESHOLD)).toEqual([42]);
  });

  it("returns event ids in input order", () => {
    expect(detectUnexplained([3, 1, 2], [], THRESHOLD)).toEqual([3, 1, 2]);
  });
});
