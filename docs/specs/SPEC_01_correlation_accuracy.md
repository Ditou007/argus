# SPEC_01 — Correlation Accuracy & Unexplained-Behavior Detection

**Subsystem:** `packages/api/src/correlation/**` (the multi-signal scoring engine) + a new `packages/eval` evaluation harness.
**Last updated:** 2026-06-14
**Status:** 🟢 Build — **all 11 slices done.** Eval package, real corpus, per-type metrics,
calibration, magic-numbers→config, unexplained detection + metrics, threshold sweep + committed
baseline, regression gate in CI, arch-aware syscall matching, container-PID identity guard. Both
capabilities measured, justified by a data-driven threshold (**0.7**, committed
`fixtures/baseline.json`: attribution F1 0.90 / 100% precision, unexplained 93.3% precision / 100%
recall) and protected by `eval-gate` CI. **Key meta-finding:** the eval harness disproved the premises
of *both* engine fixes (10 & 11) — they shipped as cross-env correctness (arm64/x64; container-init
PID) but recover no recall, because the real blockers are missing telemetry: writes lack fd/path
(**D14**) and events lack the agent's host/namespaced PID (**D15**). Both are tracked **SPEC_02
candidates** — the genuinely high-value follow-ups. SPEC_01's scoring-core scope is complete.

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
- [x] **D6 — Calibration is reported.** The report bins correlations by confidence and reports
  observed accuracy per bin over the corpus, matching hand-computed per-bin accuracy on a known
  fixture. *(test: calibration on known fixture equals hand-computed bins)* ✅ `calibration.test.ts`
  pins hand-computed decile accuracy; `corpus-cli` prints the curve over the real corpus.
- [x] **D7 — Constants live in config, behavior unchanged.** All five signal weights and every
  threshold/constant are read from config; with the shipped config the scoring output is
  **byte-identical** to the pre-extraction engine on the corpus. *(test: characterization snapshot
  pre/post extraction is identical; changing a config weight changes the score)* ✅
  `characterization.test.ts` — golden-master fingerprint byte-identical across the extraction; weight
  change shifts scores. Constants in `correlation/config.ts`.
- [x] **D8 — Unexplained behavior is detected.** Given a labelled session, detection flags exactly
  the events with no correlation ≥ threshold to any action and matches the `true_unexplained` set:
  an unreported `/etc/passwd` read is flagged; every reported event is not. *(test: fixture with 1
  unreported read → flagged; all reported events → not flagged)* ✅ Capability in Slice 6
  (`detectUnexplained`); measured against the `true_action_id === null` set in Slice 7
  (`unexplainedMetrics`, hand-computed P/R pinned) — real corpus @ 0.7: precision 93.3%, recall 100%.
- [x] **D9 — Sweep recommends and a baseline is recorded.** A threshold sweep emits precision/recall
  at each threshold, writes a recommended threshold, and writes a committed baseline metrics file.
  *(test: sweep output is structured and covers the threshold range; baseline file is written)* ✅
  `sweep.ts` + `sweep-cli.ts`; committed `fixtures/baseline.json` (recommended 0.7).
- [x] **D10 — The gate catches regressions.** The eval fails when attribution F1 or unexplained
  recall drops below the committed baseline beyond the configured tolerance. *(test: inject a
  degraded config → eval exits non-zero with the offending metric named)* ✅ `gate.ts` +
  `gate-cli.ts` + `.github/workflows/eval-gate.yml`; degraded-config test flips the gate non-ok.
- [x] **D11 — architecture-aware syscall matching (reframed by the data).** The file/function
  signals normalize the kernel symbol so `__arm64_sys_write` / `__x64_sys_write` / `__ia32_…` /
  `__…compat_sys_…` all match the bare `sys_write` (`correlation/syscall.ts`). *(test:
  `eval/arch-syscall.test.ts` — arm64/x64/bare score identically; a non-file syscall still scores 0;
  `syscall.test.ts` covers the normalization across arches.)* **⚠ The original acceptance — "write
  recall 0 → >0 on the real fixture" — does NOT hold and was retired:** every `__arm64_sys_write` in
  the corpus is path-less (size-only) and labelled noise, and the truly-attributed file_write events
  are `fd_install`. So this fix is **cross-arch correctness** (an x86 deploy needs it; it would
  silently degrade off arm64) and is byte-neutral at the 0.7 baseline — it recovers **no** recall
  here. The real blocker to file_write attribution is captured as **D14** below.
- [ ] **D14 — write events must carry an fd/path to be attributable (real fix, tracked).** Tetragon's
  `sys_write` kprobe in this setup captures only the size arg, so writes have no path/fd and cannot be
  attributed to a specific file — they fall to the noise set regardless of arch normalization (D11).
  The fix is a **tracing-policy / ingestion change** (capture the write fd→path), validated by a fresh
  capture where `__…sys_write` events become true file_write matches. Out of scope for this spec's
  scoring core (like D13); a strong **SPEC_02** candidate. *(acceptance: a re-captured corpus where
  write events carry a path; write recall > 0 for a file_write action.)*
- [x] **D12 — container-PID case handled (reframed by the data).** When `agent_pid === 1` (container
  namespace), `process_identity` no longer does invalid host-PID exact/child matching — preventing the
  false "child of agent" (0.7) match for host processes reparented to init (`process-identity.ts`,
  `CONTAINER_INIT_PID`). *(test: `eval/container-pid.test.ts` — reparented host event scores same-pod
  not 0.7; exact/child preserved for a real host PID.)* **⚠ The original acceptance — "recall improves
  on the real fixture" — does NOT hold and was retired:** the capture carries no namespaced PID
  (`ns: none`), so the agent's own host-PID syscalls can't be identified; identity stays at same-pod.
  This is **cross-env correctness** (prevents false identity in any k8s deploy), byte-neutral on the
  corpus. The real fix is **D15**.
- [ ] **D15 — capture the agent's host/namespaced PID (real fix, tracked).** The SDK reports the
  container PID (1); without the agent's host PID (or a namespaced PID on each event), exact-PID
  identity is impossible in k8s and identity is capped at same-pod=0.4. The fix is an SDK/ingestion
  change (report the agent's host PID, or have Tetragon emit the namespaced PID), validated by a fresh
  capture where the agent's own syscalls exact-match. Out of scope for the scoring core (like D13/D14);
  a **SPEC_02** candidate. *(acceptance: a re-captured corpus carrying the agent host PID; the agent's
  own events reach exact-PID identity.)*
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
- [x] **Slice 3 — Per-`action_type` metrics + threshold-parameterized report.** ✅ `scoreCorpus` +
  `perActionTypeMetrics` + `formatCorpusReport` (CLI: `corpus-cli`). Real-corpus result: at the
  engine's 0.3 band, `file_write` precision is **13%** (massive over-correlation); at **0.7** every
  type reaches **100% precision**. Recall stays 100% at 0.7 for all but `file_read`. 33 tests green.
  **→ This data deflates Slices 10 & 11** (see Real-run findings update) and points the real lever at
  the confidence threshold (Slices 4, 8).
  - *Delivers:* precision/recall/F1 per `action_type` as a function of confidence threshold; a
    written report artifact.
  - *Acceptance:* metrics equal hand-computed values per type on a known fixture; report is
    structured and deterministic.
  - *Test:* `eval/metrics.test.ts`.
  - *DoD:* tests green · `keel eval` green.
  - *Traces:* D4(full), D9(partial). *Depends on:* Slice 1.
- [x] **Slice 4 — Calibration.** ✅ `calibrationBins` (decile bins over *emitted* correlations,
  uncertain excluded, FP-robust binning rounded to the engine's 3dp grid) + `formatCalibrationReport`,
  wired into `corpus-cli`. Real-corpus curve: the 72 emitted correlations below 0.4 are **0% accurate**
  (the over-correlation noise tail), 0.4–0.6 are weakly accurate (8–25%), and **every correlation ≥0.7
  is 100% accurate** — empirically confirming Slice 3's finding that the confidence threshold is the
  real lever (Slices 8, 9). 37 tests green.
  - *Delivers:* correlations binned by confidence band with observed accuracy per bin, plus bin
    counts, in the report.
  - *Acceptance:* per-bin accuracy matches hand-computed bins on a known fixture; bin counts shown.
  - *Test:* `eval/calibration.test.ts`.
  - *DoD:* tests green · `keel eval` green.
  - *Traces:* D6. *Depends on:* Slice 3.
- [x] **Slice 5 — Magic numbers → config (characterization-guarded). Refactor-only.** ✅ New
  `packages/api/src/correlation/config.ts` (`CorrelationConfig` + `DEFAULT_CORRELATION_CONFIG`) holds
  the 5 weights, discard `0.15`, bands `0.7`/`0.3`, clock-skew `500ms`, min-window pad `200ms`, and the
  Gaussian coeff. Signals became config-bound factories (`processIdentity(config)` …); the registry,
  correlator, and `scoreCorpus` accept a config. Guarded by `eval/characterization.test.ts`: a
  golden-master fingerprint of all 148 (action,event) confidences over the real corpus is
  **byte-identical** pre/post extraction, and a second test proves changing a weight changes scores.
  The factory refactor un-grandfathered three over-complex signals (file-path, function-relevance,
  network-destination) — fixed by behavior-preserving predicate extractions under the golden master.
  39 tests green. *(Scope note: per-signal score tiers — e.g. child-PID 0.7, same-pod 0.4 — stay as
  named constants in their signal; this slice extracts the engine-wide weights/thresholds the plan
  enumerates, not every score literal.)*
  - *Delivers:* all five signal weights + thresholds/constants (`0.15` discard, `0.7`/`0.3` bands,
    `500ms` skew, `200ms` pad, Gaussian coeff) read from config; signals read config, never hardcode.
  - *Acceptance:* with shipped config, scoring output is byte-identical to pre-extraction on the
    corpus (rounding preserved); changing a config weight changes the score.
  - *Test:* `eval/characterization.test.ts` (snapshot pre/post identical).
  - *DoD:* tests green · `keel eval` green · no behavior change · spec touched.
  - *Traces:* D7. *Depends on:* Slice 3.
- [x] **Slice 6 — Unexplained-behavior detection (new capability, additive).** ✅ Pure
  `detectUnexplained(eventIds, correlations, threshold)` in `correlation/unexplained.ts` flags every
  event whose strongest correlation to *any* action is below threshold. Additive HTTP surface
  `GET /api/sessions/:id/unexplained` (production DB/streaming path otherwise untouched). First tests
  in `@argus/api` (vitest added): 5 unit tests for the detector; `eval/unexplained.test.ts` exercises
  the capability over the real corpus (strongly-attributed events never flagged; flagged events all
  below the high band). 51 tests green. *(Route semantics: population = the pod's events in the
  session window padded ±1s to match the engine's candidate window; `threshold` defaults to the high
  band and is validated to `[0,1]`; an event is "explained" at confidence ≥ threshold.)*
  - *Delivers:* logic + additive API surface that flags every session event with no correlation ≥
    threshold to any action as `unexplained`; production DB/streaming path otherwise untouched.
  - *Acceptance:* an unreported `/etc/passwd` read is flagged; every reported event is not.
  - *Test:* `eval/unexplained.test.ts` + an API test for the additive surface.
  - *DoD:* tests green · `keel eval` green · spec touched.
  - *Traces:* D8(capability). *Depends on:* Slice 3.
- [x] **Slice 7 — Unexplained-behavior metrics.** ✅ `unexplainedMetrics(events, scores, threshold)`
  measures detection precision/recall against the ground-truth `true_action_id === null` set (uncertain
  excluded); `formatUnexplainedReport` + wired into `corpus-cli`. Real-corpus result @ 0.7: detection
  **precision 93.3% (tp=56 fp=4), recall 100% (fn=0)** — at the high band the detector surfaces every
  truly-unexplained event with only 4 reported-event false positives. 45 eval tests green.
  - *Delivers:* detection precision/recall against the labelled `true_unexplained` set, in the report.
  - *Acceptance:* detection P/R equal hand-computed values on a labelled fixture.
  - *Test:* `eval/unexplained-metrics.test.ts`.
  - *DoD:* tests green · `keel eval` green.
  - *Traces:* D8(full). *Depends on:* Slice 6.
- [x] **Slice 8 — Threshold sweep + committed baseline.** ✅ `sweepThresholds` (micro-averaged
  attribution P/R/F1 + unexplained P/R at each threshold) + `recommendThreshold` (max attribution F1,
  tie → higher threshold for precision) + `buildBaseline`; `sweep-cli` prints the curve and writes the
  committed `fixtures/baseline.json`. Recommended **0.7**: attribution precision 100% / recall 81.8% /
  F1 0.90, unexplained precision 93.3% / recall 100%. The full curve makes the tradeoff explicit
  (≤0.4 = noise; 0.6–0.7 = the sweet spot; ≥0.8 = recall collapse). 51 eval tests green.
  - *Delivers:* a sweep emitting P/R at each threshold, a recommended threshold, and a committed
    baseline metrics file.
  - *Acceptance:* sweep output covers the threshold range and is structured; baseline file written.
  - *Test:* `eval/sweep.test.ts`.
  - *DoD:* tests green · `keel eval` green · baseline committed.
  - *Traces:* D9(full). *Depends on:* Slices 3, 4.
- [x] **Slice 9 — Regression gate.** ✅ `checkRegression(current, baseline, tolerance)` fails when
  attribution F1 or unexplained recall falls more than tolerance (default 0.05) below the committed
  baseline, naming each offending metric; `gate-cli` scores the corpus at the baseline threshold and
  exits non-zero on regression. Wired into CI via `.github/workflows/eval-gate.yml` (+ `eval:gate`
  npm script). D10 acceptance proven: a degraded config (`discardThreshold 0.99`) collapses F1 and the
  gate flips non-ok naming "attribution F1". 62 eval tests green; live gate: OK @ 0.7.
  - *Delivers:* the eval wired into CI/keel, failing when attribution F1 or unexplained recall drops
    below the committed baseline beyond a configured tolerance.
  - *Acceptance:* injecting a degraded config makes the eval exit non-zero, naming the offending metric.
  - *Test:* `eval/gate.test.ts`.
  - *DoD:* tests green · `keel eval` green · CI wired.
  - *Traces:* D10. *Depends on:* Slice 8.
- [x] **Slice 10 — Fix: architecture-aware syscall matching.** ✅ `correlation/syscall.ts`
  `normalizeSyscall` extracts the canonical `sys_<name>` core (arch/compat-agnostic by construction);
  the file-path + function-relevance signals match on the normalized core, keeping the raw symbol in
  `reason` for observability. **The eval harness disproved the slice's premise:** all 22
  `__arm64_sys_write` in the corpus are path-less, size-only, and labelled noise (true file_write =
  `fd_install`), so the fix recovers **no recall** here — it raised those noise events 0.37 → 0.56
  (still < 0.7, baseline unchanged). Shipped anyway as **cross-arch correctness** (arm64/x64/ia32/
  compat) — leaving it unfixed silently degrades any non-arm64 deploy. The real blocker (write
  fd/path capture) is tracked as **D14**. 65 eval tests green; golden master updated for the
  intentional confidence shift.
  - *Delivers:* the file/function signals match the kernel symbol regardless of the `__<arch>_`
    prefix via `normalizeSyscall`. (Network keys on `tcp_*` kernel functions, not arch-prefixed
    syscalls; `action-parser`'s expected lists are already bare — neither needed changes.)
  - *Acceptance (reframed):* arm64/x64/bare write syscalls score identically as file ops; a non-file
    syscall still scores 0; the synthetic decoy corpus is unaffected (no arch-prefixed syscalls).
  - *Test:* `eval/arch-syscall.test.ts` + `api/correlation/syscall.test.ts`.
  - *DoD:* tests green · `keel eval` green · spec touched (correlation code changed).
  - *Traces:* D11 (reframed) + D14 (tracked). *Depends on:* Slice 2 (real fixture), Slice 3 (metrics).
- [x] **Slice 11 — Fix: container-PID reality.** ✅ When `agent_pid === 1` (container-init namespace
  PID), `process_identity` skips the exact-PID and child-PID host comparisons and falls to the
  pod-level signal — guarded by `CONTAINER_INIT_PID`. **Same shape as Slice 10:** the harness showed
  the namespaced PID isn't in the capture (`ns: none`), so the agent's own host-PID syscalls can't be
  identified → no recall recovery; and this corpus has 0 reparented events, so it's byte-neutral here
  (golden master unchanged). But it fixes a real latent cross-env bug: in any k8s deploy, host
  processes reparented to init have parent PID 1 and would spuriously match as "child of agent" (0.7
  false positive). The real fix (capture the agent's host/namespaced PID) is tracked as **D15**.
  - *Delivers:* `process_identity` no longer does host-PID exact/child matching when the agent PID is
    the container-init PID (1); identity falls to the pod signal, preventing false child matches.
  - *Acceptance (reframed):* with `agent_pid=1`, a host event reparented to init scores same-pod
    (0.4), not the 0.7 false child match; exact/child matching is preserved when `agent_pid` is a real
    host PID; the corpus is byte-neutral (golden master unchanged).
  - *Test:* `eval/container-pid.test.ts`.
  - *DoD:* tests green · `keel eval` green · spec touched.
  - *Traces:* D12 (reframed) + D15 (tracked). *Depends on:* Slice 2, Slice 3.

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

1. **arm64 syscall names.** Real write events are `__arm64_sys_write`, but the signals hardcoded
   `sys_write` → that signal never fired on arm64. → Slice 10 fixed via `normalizeSyscall`
   (cross-arch). **Deeper finding (Slice 10 build):** the harness showed those writes are also
   **path-less** (the kprobe captured only the size arg) and labelled noise, so arch normalization
   alone recovers no recall — making writes attributable needs the write fd/path captured at the
   tracing layer (→ **D14**, a SPEC_02 candidate). Vindicates seeding fixtures from real captures
   over idealized synthetic names — twice over.
2. **Container PID.** (→ Slice 11 fixed the false-match risk; → **D15** tracks the real telemetry fix.)
   The SDK reports `agent_pid=1` (container namespace); Tetragon reports host
   PIDs → `process_identity` exact-match is dead in k8s, always same-pod=0.4. → Slice 11 (fix).
3. **Over-correlation.** One `httpbin` GET drew 98 correlated events (62 low-confidence) — the false-
   positive tail the precision metric (D5) is built to quantify.
4. **Ingestion timing.** The first 3 actions correlated 0 — events arrive after the action ends. →
   measured (D13), not fixed here (ingestion-architecture concern).
