import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFixture } from "../fixture.js";

const loadJson = (relPath: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf8"));

describe("parseFixture", () => {
  it("accepts the committed llm_call_decoy fixture", () => {
    const fixture = parseFixture(loadJson("../../fixtures/llm_call_decoy.json"));
    expect(fixture.action.action_type).toBe("llm_call");
    expect(fixture.events).toHaveLength(3);
    // Every event carries a label — no event left unlabelled.
    expect(fixture.events.every((e) => typeof e.true_match === "boolean")).toBe(true);
  });

  it("rejects a fixture whose event is missing the true_match label", () => {
    const raw = loadJson("../../fixtures/llm_call_decoy.json") as {
      events: Array<Record<string, unknown>>;
    };
    delete raw.events[0].true_match;
    expect(() => parseFixture(raw)).toThrow();
  });

  it("rejects a fixture missing the action", () => {
    expect(() => parseFixture({ name: "x", events: [] })).toThrow();
  });

  it("rejects a non-object input", () => {
    expect(() => parseFixture("not a fixture")).toThrow();
  });
});
