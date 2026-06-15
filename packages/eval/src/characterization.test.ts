import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_CORRELATION_CONFIG } from "@argus/api/correlation/config";
import { parseCorpus } from "./corpus.js";
import { scoreCorpus } from "./score-corpus.js";

const corpus = parseCorpus(
  JSON.parse(
    readFileSync(fileURLToPath(new URL("../fixtures/corpus-real.json", import.meta.url)), "utf8")
  )
);

// A stable, diffable fingerprint of every (action, event) confidence the engine
// emits over the real corpus — one line per pair, sorted. This is the golden
// master: it must stay byte-identical across the magic-numbers→config extraction
// (D7). If a refactor changes any score, the snapshot diff names the pair.
const fingerprint = (): string =>
  scoreCorpus(corpus)
    .map((s) => `${s.action_id}:${s.event_id}=${s.confidence}`)
    .sort()
    .join("\n");

describe("correlation engine characterization (D7)", () => {
  it("scores the real corpus byte-identically to the frozen golden master", () => {
    expect(fingerprint()).toMatchSnapshot();
  });

  it("is config-driven: changing a signal weight changes the scores", () => {
    const heavier = {
      ...DEFAULT_CORRELATION_CONFIG,
      weights: { ...DEFAULT_CORRELATION_CONFIG.weights, process_identity: 0.9 },
    };
    const baseline = scoreCorpus(corpus).map((s) => s.confidence);
    const tweaked = scoreCorpus(corpus, heavier).map((s) => s.confidence);
    expect(tweaked).not.toEqual(baseline); // the weight is read from config, not hardcoded
  });
});
