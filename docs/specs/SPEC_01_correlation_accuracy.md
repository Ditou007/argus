# SPEC_01 — Correlation Accuracy & Unexplained-Behavior Detection

**Subsystem:** `packages/api/src/correlation/**` (the multi-signal scoring engine) + a new `packages/eval` evaluation harness.
**Last updated:** 2026-06-14
**Status:** 🟢 Build in progress — 11 slices in `## Plan`. Slice 1 done; Slice 2 real capture
obtained (labelling pending). Scope expanded with arm64 + container-PID engine fixes (Slices 10–11)
after running on real Kubernetes — see **Real-run findings**.

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
11. **Fix: architecture-aware syscall matching.** The signals hardcode `sys_write`/`sys_read`, but
    real arm64 Tetragon events are `__arm64_sys_write` (and x86 `__x64_sys_write`). Normalize the
    kernel symbol (strip the `__<arch>_` prefix) where the signals compare function names, proven by
    the real fixture: write recall goes from 0 → matching before/after.
12. **Fix: container-PID reality.** The SDK reports the container-namespace PID (`1`), while Tetragon
    reports host PIDs, so `process_identity`'s exact-PID=1.0 path never fires in k8s. Make identity
    robust to the namespace gap (translate via pod+namespaced-pid, or stop treating exact-PID as the
    dominant signal when the agent PID is a container PID), measured before/after on the real fixture.

> Tasks 11–12 emerged from running the pipeline on real Kubernetes (see **Real-run findings**). The
> over-correlation tail and the ingestion-timing gap (early actions correlate 0) are **measured** by
> this spec but fixed elsewhere — timing is an ingestion-architecture concern, not a scoring bug.

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
- [ ] **D11 — arm64 write syscalls correlate (fix).** Using the real captured fixture, a
  `file_write` action's `__arm64_sys_write` events are matched by the file/function signals. Recall
  for the write syscall is 0 **before** the normalization fix and > 0 **after**. *(test: real
  fixture, assert `__arm64_sys_write` recall before/after; assert `sys_write` still matches too)*
- [ ] **D12 — container-PID case handled (fix).** With `agent_pid` = a container PID (`1`) and
  host-PID events, identity no longer silently dead-ends at same-pod=0.4 for the agent's own
  syscalls; attribution recall on the real fixture improves measurably after the fix. *(test: real
  fixture, assert identity contribution / recall before vs after)*
- [ ] **D13 — ingestion-timing gap is measured, not hidden.** The harness reports the recall lost
  when an action ends before its events are ingested (the first actions in the real run correlated
  0). Reported as a named metric, with the cause documented — fixing it is out of scope (ingestion
  architecture). *(test: a fixture modelling late-arriving events shows the recall gap is reported)*

---

## Plan

Sequenced, value-first slices. `/keel:build` walks this top-down, ticking `[ ]` → `[x]` as each
ships. Each slice is one reviewable PR under the PR-size budget (`prSize.fail = 15`).

- [x] **Slice 1 — Thin e2e: one synthetic fixture → one precision/recall number.** ✅ `packages/eval` scores the `llm_call_decoy` fixture through the real `@argus/api` engine (no DB/DNS): true syscalls → conf 1.0, decoy `fd_install` → conf 0.481; at threshold 0.3, precision 2/3, recall 1.0. 12 tests green.
  - *Delivers:* `packages/eval` workspace package; a minimal Zod fixture schema; one hand-authored
    synthetic fixture (`llm_call` + a true `tcp_connect` event + the same-PID-in-window decoy
    `fd_install`); a runner that feeds it through the **real** `scoreEvent`/`parseActionHints` and
    prints precision/recall at confidence threshold 0.3.
  - *Acceptance:* schema rejects a fixture with a missing label; the runner uses zero DB/network;
    two runs produce identical output; on this fixture P/R equal hand-computed values; the decoy is
    counted against precision at 0.3.
  - *Test:* `eval/runner.test.ts` (known-answer fixture) + `eval/schema.test.ts` (reject malformed).
  - *DoD:* tests green · `keel eval` green · within budget.
  - *Traces:* D1(partial), D3, D4(this fixture), D5. *Depends on:* —
- [x] **Slice 2 — Real seed fixture + multi-action corpus loader.** ✅ `corpus-real.json` curated
  from a live kind+Tetragon `real_agent.py` run: 94 real events (22 intent-matches, 16 uncertain, 56
  noise) across all 5 action types, with a multi-action `parseCorpus` schema (`true_action_id` /
  `uncertain`), a documented intent-based labelling rule, and a repeatable curation script. 20 tests
  green.
  - *Delivers:* a frozen, hand-labelled fixture captured from a real `real_agent.py` run under
    Tetragon, covering all five action types; schema extended to multi-action sessions; documented,
    repeatable capture procedure.
  - *Acceptance:* fixture loads; all 5 `action_type`s present; no event unlabelled; capture
    procedure documented.
  - *Test:* `eval/corpus.test.ts` (loads real fixture, asserts 5 types, asserts full labelling).
  - *DoD:* tests green · `keel eval` green · capture doc committed.
  - *Traces:* D2. *Depends on:* Slice 1.
- [ ] **Slice 3 — Per-`action_type` metrics + threshold-parameterized report.**
  - *Delivers:* precision/recall/F1 per `action_type` as a function of confidence threshold; a
    written report artifact.
  - *Acceptance:* metrics equal hand-computed values per type on a known fixture; report is
    structured and deterministic.
  - *Test:* `eval/metrics.test.ts`.
  - *DoD:* tests green · `keel eval` green.
  - *Traces:* D4(full), D9(partial). *Depends on:* Slice 1.
- [ ] **Slice 4 — Calibration.**
  - *Delivers:* correlations binned by confidence band with observed accuracy per bin, plus bin
    counts, in the report.
  - *Acceptance:* per-bin accuracy matches hand-computed bins on a known fixture; bin counts shown.
  - *Test:* `eval/calibration.test.ts`.
  - *DoD:* tests green · `keel eval` green.
  - *Traces:* D6. *Depends on:* Slice 3.
- [ ] **Slice 5 — Magic numbers → config (characterization-guarded). Refactor-only.**
  - *Delivers:* all five signal weights + thresholds/constants (`0.15` discard, `0.7`/`0.3` bands,
    `500ms` skew, `200ms` pad, Gaussian coeff) read from config; signals read config, never hardcode.
  - *Acceptance:* with shipped config, scoring output is byte-identical to pre-extraction on the
    corpus (rounding preserved); changing a config weight changes the score.
  - *Test:* `eval/characterization.test.ts` (snapshot pre/post identical).
  - *DoD:* tests green · `keel eval` green · no behavior change · spec touched.
  - *Traces:* D7. *Depends on:* Slice 3.
- [ ] **Slice 6 — Unexplained-behavior detection (new capability, additive).**
  - *Delivers:* logic + additive API surface that flags every session event with no correlation ≥
    threshold to any action as `unexplained`; production DB/streaming path otherwise untouched.
  - *Acceptance:* an unreported `/etc/passwd` read is flagged; every reported event is not.
  - *Test:* `eval/unexplained.test.ts` + an API test for the additive surface.
  - *DoD:* tests green · `keel eval` green · spec touched.
  - *Traces:* D8(capability). *Depends on:* Slice 3.
- [ ] **Slice 7 — Unexplained-behavior metrics.**
  - *Delivers:* detection precision/recall against the labelled `true_unexplained` set, in the report.
  - *Acceptance:* detection P/R equal hand-computed values on a labelled fixture.
  - *Test:* `eval/unexplained-metrics.test.ts`.
  - *DoD:* tests green · `keel eval` green.
  - *Traces:* D8(full). *Depends on:* Slice 6.
- [ ] **Slice 8 — Threshold sweep + committed baseline.**
  - *Delivers:* a sweep emitting P/R at each threshold, a recommended threshold, and a committed
    baseline metrics file.
  - *Acceptance:* sweep output covers the threshold range and is structured; baseline file written.
  - *Test:* `eval/sweep.test.ts`.
  - *DoD:* tests green · `keel eval` green · baseline committed.
  - *Traces:* D9(full). *Depends on:* Slices 3, 4.
- [ ] **Slice 9 — Regression gate.**
  - *Delivers:* the eval wired into CI/keel, failing when attribution F1 or unexplained recall drops
    below the committed baseline beyond a configured tolerance.
  - *Acceptance:* injecting a degraded config makes the eval exit non-zero, naming the offending metric.
  - *Test:* `eval/gate.test.ts`.
  - *DoD:* tests green · `keel eval` green · CI wired.
  - *Traces:* D10. *Depends on:* Slice 8.
- [ ] **Slice 10 — Fix: architecture-aware syscall matching.**
  - *Delivers:* the file/function/network signals + `action-parser` match the kernel symbol
    regardless of the `__<arch>_` prefix (`__arm64_sys_write` / `__x64_sys_write` / `sys_write`),
    via a normalization helper read by the signals.
  - *Acceptance:* on the real fixture, `__arm64_sys_write` recall is 0 before and > 0 after;
    `sys_write` still matches; no other signal regresses (characterization on the synthetic corpus).
  - *Test:* `eval/arch-syscall.test.ts` (before/after recall on the real fixture).
  - *DoD:* tests green · `keel eval` green · spec touched (correlation code changed).
  - *Traces:* D11. *Depends on:* Slice 2 (real fixture), Slice 3 (metrics).
- [ ] **Slice 11 — Fix: container-PID reality.**
  - *Delivers:* `process_identity` no longer treats exact-PID as dominant when the agent PID is a
    container PID; identity is derived from pod + the namespaced PID where available, so the agent's
    own host-PID syscalls aren't capped at same-pod=0.4.
  - *Acceptance:* on the real fixture (agent_pid=1, host-PID events) attribution recall improves
    measurably after the fix; the synthetic exact-PID fixture still scores 1.0.
  - *Test:* `eval/container-pid.test.ts` (before/after on the real fixture; exact-PID unchanged).
  - *DoD:* tests green · `keel eval` green · spec touched.
  - *Traces:* D12. *Depends on:* Slice 2, Slice 3.

**Risks carried:** (1) Slice 2 needs live Tetragon/k8s — infra confirmed available. (2) Labelling is
subjective; mitigated by documented rules + an `uncertain` label excluded from P/R. (3) D7
byte-identical vs float rounding — preserve the exact `Math.round(x*1000)/1000`. (4) Capability (ii)
inherits (i)'s errors — sequenced last, guarded by the Slice 9 baseline gate.

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

### Real-run findings (2026-06-14)

Running the full pipeline on kind+Tetragon (after fixing two pre-existing infra bugs — `pnpm@latest`
breaking the Node-20 image build, and `setup.sh` never applying `tetragon-grpc-service.yaml`)
produced the first real correlation data and surfaced four scoring-fidelity issues that reshaped the
plan:

1. **arm64 syscall names.** Real write events are `__arm64_sys_write` (340 of them), but the signals
   hardcode `sys_write` → that signal never fires on arm64. → Slice 10 (fix). Vindicates seeding
   fixtures from real captures rather than idealized synthetic names.
2. **Container PID.** The SDK reports `agent_pid=1` (container namespace); Tetragon reports host
   PIDs → `process_identity` exact-match is dead in k8s, always same-pod=0.4. → Slice 11 (fix).
3. **Over-correlation.** One `httpbin` GET drew 98 correlated events (62 low-confidence) — the false-
   positive tail the precision metric (D5) is built to quantify.
4. **Ingestion timing.** The first 3 actions correlated 0 — events arrive after the action ends. →
   measured (D13), not fixed here (ingestion-architecture concern).
