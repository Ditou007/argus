import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectUnexplained } from "@argus/api/correlation/unexplained";
import { DEFAULT_CORRELATION_CONFIG } from "@argus/api/correlation/config";
import { parseCorpus } from "./corpus.js";
import { scoreCorpus } from "./score-corpus.js";

const corpus = parseCorpus(
  JSON.parse(
    readFileSync(fileURLToPath(new URL("../fixtures/corpus-real.json", import.meta.url)), "utf8")
  )
);

const THRESHOLD = DEFAULT_CORRELATION_CONFIG.bands.high; // an event is "explained" at high confidence

describe("unexplained-behaviour detection over the real corpus (D8)", () => {
  const scores = scoreCorpus(corpus);
  const eventIds = corpus.events.map((e) => e.id);
  const pairs = scores.map((s) => ({ event_id: s.event_id, confidence: s.confidence }));
  const unexplained = new Set(detectUnexplained(eventIds, pairs, THRESHOLD));

  it("never flags an event the engine strongly attributed to its true action", () => {
    const stronglyAttributed = scores
      .filter((s) => s.true_match && s.confidence >= THRESHOLD)
      .map((s) => s.event_id);
    expect(stronglyAttributed.length).toBeGreaterThan(0); // the corpus has real strong matches
    for (const id of stronglyAttributed) {
      expect(unexplained.has(id)).toBe(false);
    }
  });

  it("surfaces unexplained behaviour: every flagged event has no correlation at the threshold", () => {
    expect(unexplained.size).toBeGreaterThan(0);
    for (const id of unexplained) {
      const maxConfidence = Math.max(
        0,
        ...scores.filter((s) => s.event_id === id).map((s) => s.confidence)
      );
      expect(maxConfidence).toBeLessThan(THRESHOLD);
    }
  });
});
