# SPEC_04 — Storage & Forensic Architecture (store the gap, retain the trace)

**Subsystem:** `packages/ingestion/**` (the firehose write path — `event-store.ts`) · a new
**ClickHouse** columnar store (raw events + correlated traces) · `packages/api/src/correlation/**`
(the correlator — now a streaming consumer that reads the columnar store and writes findings) ·
`docker-compose.yml` (new ClickHouse service) · retention/TTL config · `packages/api` + `packages/dashboard`
(the forensic replay surface).
**Last updated:** 2026-06-22
**Status:** 🟢 Define complete — decisions locked, ready for `/keel:plan`. Engine = **ClickHouse**
(real, per [ADR 0001](../adr/0001-forensic-first-runtime-governance.md)); correlation = **streaming**
(production-correct, not action-end batch); scope = **full T1–T5**; retention = **tiered 30d / 180d / ∞**;
migration = **phased cutover** (transient dual-write T1→T2, then single write path).

---

## Why (problem)

Argus currently writes the **entire syscall firehose into Postgres** — `event-store.insert()`
INSERTs every Tetragon event into the `events` table (raw JSONB) and publishes to Redis; the
correlator then queries that `events` table at **action-end**. In the demo this reached ≈1.4M rows.
Three problems:

1. **Cost scales with the firehose, not the value.** Storage, ingest, and triage-query cost all
   grow with the raw syscall volume, not with the *gap* (the product's value). The SPEC_03/04 risk
   de-noise is **query-time only** — it ranks, it does not reduce what is stored.
2. **Action-end correlation races ingestion lag.** For fast operations the syscalls aren't yet
   committed to Postgres when the declared action closes, so the end-of-action batch query misses
   them (a known SPEC_03 failure mode).
3. **Wrong shape for a forensic-audit product.** ADR 0001 commits Argus to *forensic-first runtime
   governance & audit*; that identity needs a cheap, time-bounded, queryable trace — not an
   unbounded relational firehose.

## Goal

**Make durable storage proportional to what matters, retain a queryable forensic trace, and correlate
in-flight.** The raw syscall firehose and the correlated traces live in **ClickHouse** with tiered,
configurable TTL; **Postgres holds only** sessions, declared actions, correlations, and risk-ranked
**unexplained findings** (the product surface + index) and **never ingests the firehose**. The
correlator becomes a **streaming consumer** of the live event stream, attributing syscalls to open
declared-action windows incrementally — removing the action-end ingestion-lag race. The result: a
cheap, time-bounded audit record + a fast findings index + lower-latency detection — the storage and
correlation shape a forensic governance/audit product needs.

Why it matters: this is the architecture ADR 0001 commits to and the cost reality SPEC_03 exposed.
Without it the demo's 1.4M-row firehose is the production cost curve, and "governance & audit" has no
retained trace to stand on.

## Architecture (target)

```
agent (SDK)        Tetragon (eBPF)        ingestion                 ClickHouse (columnar)
  └─ declares ───► captures syscalls ───► writes RAW events ───────► events            (TTL 30d)
       │                  │                     │  + Redis publish        correlated_traces (TTL 180d)
       ▼                  │                     ▼                              ▲
   Postgres               └────────────────► STREAMING correlator ────────────┘ writes the trace
   sessions · actions · correlations · findings ◄── consumes the live stream, attributes syscalls to
   (the gap + index, retained ∞)                    open action windows, writes only the FINDING ─► PG
```

**Invariants:**
- **ingestion → ClickHouse (raw firehose only); correlator → ClickHouse `correlated_traces` (the
  explained trace) + Postgres (findings only).** Postgres never receives a raw syscall row.
- ClickHouse is the system of record for the **trace**; Postgres is the system of record for the
  **findings/surface**.
- Correlation is **streaming**: the correlator consumes the Redis event stream and attributes events
  to open declared-action windows as they arrive — it does **not** issue an end-of-action batch query
  that can race ingestion lag.

## Retention tiers (configurable via env)

| Data | Store | Default TTL | Rationale |
| --- | --- | --- | --- |
| Raw syscall firehose (`events`) | ClickHouse | **30d** | Cost control; the unattributed bulk. |
| Correlated traces (`correlated_traces`) | ClickHouse | **180d** | The EU AI Act Art. 12/19 6-month high-risk audit floor — the retained forensic record. |
| Findings + index (sessions/actions/correlations/unexplained) | Postgres | **∞** | The product surface; small, grows with findings not firehose. |

Each TTL is overridable by env (`ARGUS_RAW_TTL_DAYS`, `ARGUS_TRACE_TTL_DAYS`). **No benign-noise
sampling in v1** — TTL plus the columnar store handles cost; sampling is a later optimization.

---

## Tasks (atomic vertical slices)

- **T1 — ClickHouse in compose + ingestion dual-writes raw events.** Add a ClickHouse service to
  `docker-compose.yml`; create the `events` table; make `event-store` write each raw Tetragon event
  to ClickHouse **in addition to** the existing Postgres path (transient dual-write — nothing
  downstream breaks yet). Prove a captured session's raw events land in ClickHouse and are queryable.
- **T2 — Streaming correlator reads ClickHouse, writes findings; cut Postgres off the firehose.**
  Reimplement the correlator as a streaming consumer of the Redis event stream: attribute syscalls to
  open declared-action windows incrementally, write the explained trace to ClickHouse
  `correlated_traces`, and write only sessions/actions/correlations/unexplained findings to Postgres.
  **Remove the Postgres firehose write** from `event-store` (ingestion → ClickHouse only). This closes
  the action-end ingestion-lag race.
- **T3 — Retention/TTL + partitioning.** Time-partition the ClickHouse tables; apply env-configurable
  TTL (raw 30d / traces 180d defaults) so old partitions auto-drop. Postgres findings unaffected.
- **T4 — Forensic query/replay surface.** An API endpoint serves a session's full correlated trace
  (declared actions + attributed syscalls + verdict) from ClickHouse; the dashboard renders it for
  audit/replay ("what did the agent actually do").
- **T5 — Migration + cost validation.** Cut the demo over to the new path; measure ClickHouse
  storage + query cost against the Postgres-firehose baseline (~1.4M rows) and record the win; confirm
  SPEC_01/02 correlation behavior and baselines are unchanged.

## Done (acceptance — each becomes a test/recorded check)

- [ ] **[T1]** A fresh `docker compose up` brings up ClickHouse; after a capture, raw syscall events
  are queryable in ClickHouse (`SELECT count() FROM events WHERE session = …` > 0).
- [ ] **[T2]** Ingestion writes raw syscalls **only** to ClickHouse: during a capture the Postgres
  `events` row count stays flat (0 new rows) while ClickHouse `events` grows.
- [ ] **[T2]** The streaming correlator attributes a declared action's syscalls and emits the
  undeclared gap as a finding **without an end-of-action batch query** — verified by the SPEC_03
  fast-op fixture that previously raced (it now correlates deterministically).
- [ ] **[T2]** A **real** declared action (sub-second), whose syscalls reach the stream only after the
  action ends (live pipeline lag ~10–60s), still produces a `correlated_traces` row — i.e. a live agent
  run yields trace rows for its own sessions, not just synchronously-injected test data (Slice 2e).
- [ ] **[T2]** Postgres holds only sessions/actions/correlations/findings; its row growth is
  proportional to findings, not the firehose — demonstrated against the ~1.4M-row baseline (Postgres
  total rows after a demo run are orders of magnitude below the captured syscall count).
- [ ] **[T3]** Raw `events` expire after the configured TTL while `correlated_traces` persist to their
  (longer) TTL and Postgres findings persist — asserted with a short test TTL (rows past the window are
  gone; rows inside it and the findings remain). TTL is env-overridable.
- [ ] **[T4]** A session's full correlated trace (declared actions + attributed syscalls + verdict) is
  returned by an API endpoint and rendered in the dashboard for audit/replay.
- [ ] **[T5]** Migration moves demo data and a recorded measurement shows ClickHouse storage/query
  cost vs. the Postgres-firehose baseline (the documented "store the gap" win).
- [ ] **[all]** `keel eval` is green and SPEC_01/02 correlation tests pass **unmodified** — this is a
  storage/retention/correlation-timing change, not a scoring change; risk/correlation outputs for the
  existing fixtures are unchanged.

---

## Non-goals (explicit)

- **No enforcement / kill switch.** Observe→alert only; soft enforcement (return-error / pause at the
  action boundary, never SIGKILL) is a later spec, per ADR 0001.
- **No scoring change.** Correlation/risk behavior is unchanged; this spec only changes **where** data
  lives, **how long**, and **when** correlation runs (streaming vs. batch).
- **Not the intent-capture redesign.** Argus stays **SDK-declared-intent only** for v1. An
  AgentSight-style instrumentation-free TLS-interception capture mode is a **separate future spec**
  (open fork in ADR 0001), not part of SPEC_04.
- **No benign-noise sampling in v1.** TTL handles cost; sampling is a later optimization.

---

## Plan (sliced, dependency-ordered — `/keel:build` ticks these `[ ]` → `[x]`)

- [x] **Slice 1 — ClickHouse service + raw-event dual-write (T1).**
  - *Delivers:* `docker compose up` brings up ClickHouse; ingestion writes each raw Tetragon event to a new ClickHouse `events` table **in addition to** Postgres (transient dual-write — nothing downstream breaks).
  - *Acceptance:* after a capture, `SELECT count() FROM events` in ClickHouse > 0; the Postgres path is unchanged.
  - *Test:* `clickhouse-store` insert → count query > 0 (fake-client unit + compose-gated integration).
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* none. *Touches:* `docker-compose.yml`, `packages/ingestion/src/clickhouse-store.ts` (new, injectable client), `config.ts`, `index.ts`; `@clickhouse/client` dep.
- [x] **Slice 2a — Streaming attribution engine + `correlated_traces` schema (T2a, pure).**
  - *Delivers:* a pure streaming window manager that, reusing the existing scoring registry **unchanged**, **accumulates** events into open declared-action windows as they arrive and runs the existing scoring at **action-close** over the accumulated set — fixing the action-end ingestion-lag race (events are captured as they stream, not queried at end) while keeping scoring identical to the batch path. Plus the ClickHouse `correlated_traces` DDL + pure trace-row mapping.
  - *Design note:* attribution is incremental (accumulate-as-arrive); **scoring is finalized at close** with the real `{started_at, ended_at}` window, so SPEC_01/02 baselines are unchanged by construction. The race is fixed by accumulation, not by changing the score.
  - *Acceptance:* events fed in stream order are attributed to the matching open window; a "fast-op" event that a batch-at-end query would miss (not yet in the store at close) **is** attributed because it was accumulated when it streamed in; the produced trace maps to a `correlated_traces` row.
  - *Test:* window manager unit tests (scope/pid+pod + time matching, accumulate→close→trace, the no-race fast-op case); `toTraceRow` pure-mapping test.
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slice 1.
- [x] **Slice 2b — Durable-stream plumbing: publisher + parser + trace-store (T2a).** Transport per [ADR 0002](../adr/0002-redis-streams-correlation-transport.md).
  - *Delivers:* ingestion `XADD`s the full event to a durable Redis Stream `argus:events:stream` (additive — the lightweight `argus:events` pub/sub for the dashboard/WS is unchanged, MAXLEN-capped); a `parseStreamEvent` (stream payload → `StreamEvent`); an API-side trace-store (a minimal ClickHouse writer) that persists `toTraceRows(trace)` to `correlated_traces`.
  - *Acceptance:* publish→stream→parse→engine→trace-store→ClickHouse produces a `correlated_traces` row end to end (the pieces wired by a test, not yet by the running API).
  - *Test:* unit (publisher XADD payload; `parseStreamEvent` round-trips a published event; trace-store persists via a fake CH client); compose-gated integration (real Redis Stream `XADD`/`XREAD` + real ClickHouse → trace row).
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slice 2a.
- [x] **Slice 2c — Live wiring: consumer service + action-lifecycle hooks (T2a).**
  - *Delivers:* a streaming-correlator service in the running API reads `argus:events:stream` via a **consumer group** (`XREADGROUP`, ack), driving `ingestEvent`; `openAction` on action-create and `closeAction` (parse hints + DNS, persist trace) on action-end are hooked into `packages/api/src/routes/session-actions.ts` (the action routes, extracted from `sessions.ts`); started in `index.ts`. PG firehose + on-demand `correlateAction` stay intact (cut in Slice 3). Rehydrate-on-restart is **deferred to Slice 2d**.
  - *Acceptance:* a real declared action + streamed events through the running API → a trace row in `correlated_traces`; events acked (at-least-once for entries added after the group exists, into windows already open; full rehydrate in 2d).
  - *Test:* unit (service drives open/ingest/close + persist with fakes; hint parsing); compose-gated integration through the API lifecycle.
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slice 2b.
- [x] **Slice 2d — Rehydrate open windows on restart (T2a).**
  - *Delivers:* on startup the correlator rebuilds its open declared-action windows from Postgres (`agent_actions WHERE ended_at IS NULL`, joined to the session for scope + `started_at`) and re-opens each via `openAction`, before the consumer starts. Combined with the consumer group redelivering unacked stream entries, an action open across a restart still attributes the events that arrive after restart and closes into a trace.
  - *Scope note:* this rehydrates the **windows**, not already-consumed (acked) events. Full replay of a window's earlier events from ClickHouse requires a **stable event id** (the stream id is currently the Postgres serial, which ClickHouse `events` does not store) — that id is established by **Slice 3** (cutting Postgres off the firehose), so full event-replay rehydrate rides with Slice 3. Honest current guarantee: windows survive restart; events acked before the restart are not re-accumulated.
  - *Acceptance:* given open actions in Postgres, `rehydrateWindows` calls `openAction` for each before the consumer starts (verified via the captured opener calls); a closed action (`ended_at` set) is excluded by the query.
  - *Test:* unit — `rehydrateWindows(pool, service)` with a fake pool → each row re-opened with its scope + start, the query filters `ended_at IS NULL`, empty → 0.
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slice 2c.
- [ ] **Slice 2e — Settle/grace window so latent events are still attributed (T2 correctness fix).**
  - *Why:* the live run (2026-06-22) showed **zero `correlated_traces` for real agent sessions**. Root cause: events only accumulate into a window while it is open (`openAction`→`closeAction`), but the real ingestion pipeline lags `event_time`→stream arrival by **~10s steady-state (avg 63s, max 374s during backlog)** while declared actions are **sub-second**. So every real window closes ~10–60s **before** its events stream in → empty window → `trace-store.persist` drops the empty trace → no row. (Slice 2a's "fast-op is accumulated when it streams in" assumption holds only when events arrive *before* close — true for synchronous test data, false for the live pipeline.)
  - *Delivers:* on `closeAction`, the window is **not** discarded; it is marked closing (capturing `ended_at` + resolved hints) and finalized after a configurable **settle delay** (`ARGUS_TRACE_SETTLE_MS`, default > observed pipeline latency). `ingestEvent` keeps adding scope-matching events to closing windows; at settle the accumulated set is scored against the real `{started_at, ended_at}` window (unchanged scoring) and persisted. Timer/clock injected so the engine stays deterministically testable.
  - *Acceptance:* an action whose matching events arrive **after** `ended_at` but **before** `ended_at + settle` is attributed and produces a `correlated_traces` row; scoring against the `{started_at, ended_at}` window is unchanged (SPEC_01/02 baselines hold); a window with no matching events still persists nothing.
  - *Honest guarantee / scope note:* a restart **during** the settle period loses that not-yet-finalized trace (rehydrate only rebuilds `ended_at IS NULL` windows) — documented, acceptable for v1.
  - *Test:* unit — fake clock: close → no persist before settle; matching event ingested post-close, pre-settle → attributed at settle; settle finalize persists once; restart-during-settle gap asserted.
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slice 2c.
- [ ] **Slice 2f — Descendant-PID attribution (T2 completeness).**
  - *Why:* host-PID scope matches only the exact `agent_pid`, but the `run_shell` tool spawns **child processes** (`exec`) — the most security-relevant syscalls (shell-driven exfil/file reads) run under child PIDs and are currently unattributed. Tetragon's `raw_event` already carries `process.parent.pid`/`parent_exec_id`, but neither the CH `events` column set nor `StreamEvent` extracts it.
  - *Delivers:* extract `parent_pid` (and exec id) through ingestion `event-fields` → CH `events` column → stream payload → `StreamEvent`; the correlator tracks a per-scope **descendant PID set** (seed = `agent_pid`; a `process_exec` whose `parent_pid` ∈ set adds its pid), and `matchesScope` matches the set (host-PID mode) — pod-scope mode unchanged.
  - *Acceptance:* a shell child of the declared agent process has its syscalls attributed to the action; pod-scoped attribution is unchanged; scoring unchanged.
  - *Test:* unit — process-tree seed + exec-driven membership; `matchesScope` matches a descendant pid; ingestion field extraction; parser round-trip.
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slice 2e.
- [ ] **Slice 3 — Findings → Postgres + cut Postgres off the firehose (T2b).**
  - *Delivers:* streaming correlator writes only sessions/actions/correlations/unexplained findings to Postgres; ingestion's Postgres firehose write is **removed** (ClickHouse-only); the on-demand read path (`packages/api/src/routes/sessions.ts`) sources candidate events from ClickHouse. **Note:** the durable-stream event `id` is currently the Postgres serial (`event-store.ts`); removing the PG firehose write here means the stream `id` must be **re-sourced** (mint a stable id at ingestion).
  - *Acceptance:* during a capture, Postgres `events` gets **0 new rows** while ClickHouse `events` grows; findings still land in Postgres; on-demand correlation scores match the streaming path (SPEC_01/02 baselines unchanged).
  - *Test:* capture run → assert 0 new PG `events` rows + CH `events` growth + findings present.
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slice 2.
- [ ] **Slice 4 — Retention/TTL + partitioning (T3).**
  - *Delivers:* time-partitioned ClickHouse tables with env-configurable TTL (`ARGUS_RAW_TTL_DAYS`=30 / `ARGUS_TRACE_TTL_DAYS`=180); old partitions auto-drop; Postgres findings unaffected.
  - *Acceptance:* with a short test TTL, raw `events` past the window are gone while in-window rows, `correlated_traces`, and Postgres findings remain; TTL is env-overridable.
  - *Test:* short-TTL expiry assertion (raw expires, traces + findings persist).
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slice 1.
- [x] **Slice 5a — Forensic replay API (T4).**
  - *Delivers:* `GET /api/sessions/:id/trace` serves a session's full correlated trace (declared actions + attributed events + verdict, incl. `reasons`/`signal_scores`) from ClickHouse, via a `trace-reader` (parameterized query — session id never interpolated). Reordered ahead of Slice 3 (depends only on traces in ClickHouse, done at 2c).
  - *Acceptance:* the endpoint returns the trace rows for a session (`{session_id, count, events}`); empty session → `count: 0`; reader failure → 500 without leaking detail.
  - *Test:* `trace-reader` unit (parameterized query + parse) + `trace.http` supertest (200/empty/500); live-verified read-back against real ClickHouse.
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slice 2c.
- [x] **Slice 5b — Forensic replay UI (T4).**
  - *Delivers:* a dashboard page (`/sessions/:id/trace`) renders the `/trace` endpoint for audit/replay ("what did the agent actually do") via a pure `CorrelatedTrace` component — declared actions grouped, each with attributed syscalls, confidence, method, and the reason narrative.
  - *Acceptance:* the dashboard page shows a session's correlated trace (and an empty state when none).
  - *Test:* `CorrelatedTrace` render test (action/event/confidence/reason) + the trace page render test.
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slice 5a.
- [ ] **Slice 6 — Migration + cost validation (T5).**
  - *Delivers:* demo data cutover; a recorded measurement of ClickHouse storage/query cost vs. the ~1.4M-row Postgres-firehose baseline (the documented "store the gap" win); SPEC_01/02 correlation tests pass **unmodified**.
  - *Acceptance:* recorded check shows Postgres row growth ∝ findings (orders of magnitude below captured syscall count); SPEC_01/02 baselines unchanged.
  - *Test:* recorded cost/row-growth check + SPEC_01/02 fixtures pass without modification.
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slices 1–4.

**Risks:** (1) Slice 2 PR-size — reuse scoring signals untouched; split if it overflows. (2) ClickHouse testability under the coverage gate — injectable client → fake for unit/patch-coverage, compose-gated integration. (3) Correlator restart → **rehydrate open windows from ClickHouse** (decided). (4) Two correlation paths during cutover (2→3) must produce identical scores — SPEC_01/02 baselines are the guardrail. (5) ClickHouse TTL/partition DDL — verify against official ClickHouse docs (source-driven), not memory.

---

## Change log

- **2026-06-22 — live-run correction (adds Slices 2e, 2f).** The first real end-to-end run surfaced **finding #1: no `correlated_traces` for real agent sessions** (only synchronously-injected test data appeared). Root-caused to the streaming correlator's accumulate-only-while-open model vs. the live ingestion pipeline's ~10–60s `event_time`→stream latency: real sub-second action windows close before their events arrive, yielding empty traces that `trace-store.persist` drops. Fix split into **Slice 2e** (settle/grace window — finalize after a configurable delay so latent events are still attributed) and **Slice 2f** (descendant-PID attribution — `run_shell` children currently fall outside exact-`agent_pid` scope). Scoring is unchanged; SPEC_01/02 baselines remain the guardrail. Secondary observation (finding #4): `correlated_traces` holds only **explained** events — the undeclared-attack signal lives in the Postgres unexplained gap (working), so this fix improves forensic-replay completeness, not threat detection.
- **2026-06-22 — ingestion reliability (finding #5).** The ingestion firehose-tail (`tetragon-watcher.ts`) was OOM-crashing the ingestion container (exit 139, ~87k events) and silently stopping the whole capture pipeline. Root cause: it re-read the **entire** growing export file into memory every 1s with **no reentrancy guard**, so overlapping passes (each holding a full-file string + the per-event awaited PG+CH writes) piled up until the V8 heap exhausted; it also reprocessed from byte 0 on restart, duplicating rows. Fixed by a bounded tail reader: in-flight guard, incremental new-bytes-only reads from a byte offset, rotation/truncation reset, sequential backpressured processing, and start-from-end on restart (history already lives in ClickHouse/Postgres). Regression tests encode the contract so the bug fails the suite, not just at runtime. Rode in with the `event-store.ts`/`stream-publisher.ts` `xadd` build-fix (unblocks the ingestion image `tsc` build). No change to the storage architecture or correlation behavior.
- **2026-06-22 — OOM-class hardening (audit follow-ups).** Verified audit of the same unbounded-growth class across services. First fix landed: the correlator's DNS cache (`dns-cache.ts`) capped its forward map but never evicted its reverse (IP→hostname) map → unbounded growth; now evicted together. Remaining verified items queued: gRPC watcher backpressure (`tetragon-grpc-watcher.ts`, K8s path — same handler-pile-up class as finding #5), bounded API result sets (timeline/unexplained — needs per-endpoint correctness review, not a blind `LIMIT`), and dashboard client-state windowing (live timeline/event table — infinite-scroll/virtualized). No scoring or storage-architecture change.
