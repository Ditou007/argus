import { describe, it, expect } from "vitest";
import { capTail } from "./cap-tail.js";

describe("capTail", () => {
  it("keeps only the last `max` items when over the cap", () => {
    expect(capTail([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
  });

  it("returns all items unchanged when under the cap", () => {
    expect(capTail([1, 2], 5)).toEqual([1, 2]);
  });

  it("handles the empty list and a zero/negative cap", () => {
    expect(capTail([], 3)).toEqual([]);
    expect(capTail([1, 2, 3], 0)).toEqual([]);
    expect(capTail([1, 2, 3], -1)).toEqual([]);
  });

  it("does not mutate the input", () => {
    const input = [1, 2, 3, 4];
    const out = capTail(input, 2);
    expect(out).toEqual([3, 4]);
    expect(input).toEqual([1, 2, 3, 4]);
    expect(out).not.toBe(input);
  });
});
