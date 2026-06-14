# SPEC_01 — Correlation Accuracy & Unexplained-Behavior Detection

**Subsystem:** `packages/api/src/correlation/**` (the multi-signal scoring engine) + a new `packages/eval` evaluation harness.
**Last updated:** 2026-06-14
**Status:** 🟡 Defined — awaiting `/keel:plan` (multi-slice).

---

## Goal

Make the correlation engine's accuracy **measurable and defensible**. Today the engine is a
weighted multi-signal scorer with hand-tuned constants (signal weights `0.25/0.20/0.15…`,
discard threshold `0.15`, confidence bands `0.7/0.3`, `500ms` clock-skew, `200ms` padding) and
**zero tests** — so Argus's central claim, *"a verifiable record of what an agent did, not just
what it claimed,"* is itself unverified.

This spec delivers a **deterministic, offline evaluation harness** that scores two capabilities
over a labelled corpus, so every constant can be justified by data and regressions are caught by
the gate:

- **(i) Attribution accuracy** — given the actions an agent *reported*, are the right syscall
  events linked to each (and the decoys rejected)? Measured as precision / recall / F1 per
  `action_type`, plus confidence **calibration**.
- **(ii) Unexplained-behavior detection** — which syscalls map to **no** reported action? This is
  the security story (*"the agent read `/etc/passwd` and never told you"*) and is a **new
  capability** the engine does not have today. Measured as detection precision / recall.

Why it matters: (i) lets us defend or fix every magic number; (ii) is the safety pitch and rests
on (i) — a syscall can only be called "unexplained" if attribution is trustworthy enough to know
it belongs to no action.

---

## Ground-truth method (the load-bearing decision)

Accuracy needs an answer key. We use **frozen, hand-labelled fixtures fed through the engine's
pure scoring core** (`scoreEvent` / `parseActionHints` are already pure — no DB, no DNS, no
Tetragon, no k8s):

- **Seed from reality, once.** Run `sample-agent/real_agent.py` (the "security-researcher" — it
  exercises all five action types in one session: `file_read`, `tool_use`, `network_request` ×2,
  `llm_call`, `file_write` ×2) under Tetragon, export the **real** events, hand-label which events
  each action truly caused (and which are unexplained), and **freeze** that JSON as a committed
  fixture. Real event shapes, but reproducible and offline.
- **Grow synthetically.** Author additional fixtures for cases real runs won't reliably produce —
  the same-PID-in-window decoy, back-to-back network requests, an unreported `/etc/passwd` read,
  a `curl … | sh` child process.

This keeps the eval **deterministic and CI-safe** (Node + git only; no flaky live capture in the
gate), consistent with keel doctrine.

---

## Tasks

Atomic, vertically-sliced — `/keel:plan` sequences these into reviewable PRs.

1. **Eval package + fixture schema.** New `packages/eval` workspace package. Define a Zod-validated
   labelled-fixture schema: one or more actions, a set of candidate events, a per-event
   `true_match` label keyed to an action, and a per-session `true_unexplained` event set.
2. **Capture & freeze seed fixtures.** Run `real_agent.py` under Tetragon once/twice, export real
   events, hand-label, commit as frozen fixtures. Document the capture procedure so it's repeatable.
3. **Pure-core harness runner.** Feed fixtures through the real `scoreEvent` / `parseActionHints`
   with DNS stubbed and no DB; emit per-`(action, event)` confidence. Deterministic.
4. **Attribution metrics + report.** Compute precision / recall / F1 per `action_type` as a
   function of the confidence threshold; write a report artifact.
5. **Calibration.** Bin correlations by confidence band; compute observed accuracy per bin
   ("does 0.7 mean ~70% correct?"); include in the report.
6. **Magic numbers → config.** Move weights, thresholds, clock-skew, padding, and the Gaussian
   coefficient into config read by the signals — pinned by characterization tests so the
   extraction is provably behavior-preserving.
7. **Unexplained-behavior detection (new capability).** Given a session's events and correlations,
   flag every event with no correlation ≥ threshold to any action as `unexplained`; expose via the
   API in an additive way (production DB/streaming path otherwise untouched).
8. **Unexplained-behavior metrics.** Measure detection precision / recall against the labelled
   `true_unexplained` set.
9. **Threshold sweep + baseline.** Sweep the confidence threshold (optionally weights) over the
   corpus; recommend data-driven values; write a committed baseline metrics file.
10. **Regression gate.** Wire an eval into CI/keel that fails when attribution F1 or unexplained
    recall drops below the committed baseline beyond a configured tolerance.

---

## Done

Each line is written to become a failing test in Build.

- [ ] **D1 — Fixture schema validates.** A labelled fixture is parsed by a Zod schema; a fixture
  missing a `true_match` label or referencing an unknown `action_id` is **rejected** with a clear
  error. *(test: schema accepts a valid fixture, rejects three malformed ones)*
- [ ] **D2 — Real seed fixture exists.** ≥1 frozen fixture captured from `real_agent.py` is
  committed, contains **all five** `action_type`s, and every event carries a `true_match` (or
  `unexplained`) label; the capture procedure is documented. *(test: fixture loads; asserts the 5
  action types present; asserts no event is unlabelled)*
- [ ] **D3 — Deterministic, infra-free.** The harness scores a fixture with **zero** DB and **zero**
  network access and is deterministic — two runs on the same fixture produce byte-identical
  metrics. *(test: run twice, assert identical report; assert no `pg`/socket import on the eval path)*
- [ ] **D4 — Metrics are correct on a known answer key.** On a fixture whose precision/recall/F1 are
  computed by hand, the harness reports exactly those values per `action_type`. *(test:
  known-answer fixture, assert P/R/F1 equal the hand-computed numbers)*
- [ ] **D5 — The decoy is surfaced, not hidden.** The same-PID-in-window `fd_install`-during-
  `llm_call` event (confidence ≈ 0.48) is **counted against precision** at the medium band, i.e.
  the harness reports the over-scoring rather than masking it. *(test: decoy fixture, assert it
  lowers precision at threshold 0.3)*
- [ ] **D6 — Calibration is reported.** The report bins correlations by confidence and reports
  observed accuracy per bin over the corpus, matching hand-computed per-bin accuracy on a known
  fixture. *(test: calibration on known fixture equals hand-computed bins)*
- [ ] **D7 — Constants live in config, behavior unchanged.** All five signal weights and every
  threshold/constant are read from config; with the shipped config the scoring output is
  **byte-identical** to the pre-extraction engine on the corpus. *(test: characterization snapshot
  pre/post extraction is identical; changing a config weight changes the score)*
- [ ] **D8 — Unexplained behavior is detected.** Given a labelled session, detection flags exactly
  the events with no correlation ≥ threshold to any action and matches the `true_unexplained` set:
  an unreported `/etc/passwd` read is flagged; every reported event is not. *(test: fixture with 1
  unreported read → flagged; all reported events → not flagged)*
- [ ] **D9 — Sweep recommends and a baseline is recorded.** A threshold sweep emits precision/recall
  at each threshold, writes a recommended threshold, and writes a committed baseline metrics file.
  *(test: sweep output is structured and covers the threshold range; baseline file is written)*
- [ ] **D10 — The gate catches regressions.** The eval fails when attribution F1 or unexplained
  recall drops below the committed baseline beyond the configured tolerance. *(test: inject a
  degraded config → eval exits non-zero with the offending metric named)*

---

## Non-goals (explicit — out of scope for this spec)

- **Live Tetragon/k8s capture inside CI.** Captures are frozen fixtures; the gate never runs a live
  cluster.
- **Automatic weight optimization** beyond a documented sweep — no ML training loop.
- **A dashboard UI for the metrics.** The report is a file/CLI artifact here; visualization is a
  later spec.
- **Rewriting the correlator's runtime path.** The harness reads the *pure scoring core*; the
  production DB/streaming pipeline is untouched except (a) the additive config extraction (D7) and
  (b) the additive unexplained-detection (D8).
- **Performance / latency / scale** of the engine.

---

## Notes

- Decision record: ground-truth method = frozen hand-labelled fixtures through the pure scoring
  core, seeded from real captures (chosen over live-capture-in-loop for determinism + CI-safety).
- Capability (ii) was folded into this spec by explicit decision; it is sequenced **after** (i) in
  the Plan because trustworthy attribution is its prerequisite.
