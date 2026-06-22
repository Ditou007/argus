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
- [ ] **Slice 2 — Streaming correlator: consume the stream, write `correlated_traces` (T2a).** ⚠ biggest slice — split if it overflows PR-size.
  - *Delivers:* a background consumer of the Redis event stream maintains open declared-action windows, attributes syscalls **incrementally** (reusing existing scoring signals **unchanged**), and writes the explained trace to ClickHouse `correlated_traces`. On startup it **rehydrates open windows + their events from ClickHouse** and resumes (no lost correlations across restarts). PG firehose + on-demand path stay intact (safety).
  - *Acceptance:* the explained trace lands in `correlated_traces`; the SPEC_03 fast-op fixture that previously raced now correlates deterministically; a restart mid-session resumes open windows from ClickHouse.
  - *Test:* event-stream + declared action → trace produced; previously-racing fast-op fixture attributes correctly; restart-rehydration test.
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slice 1.
- [ ] **Slice 3 — Findings → Postgres + cut Postgres off the firehose (T2b).**
  - *Delivers:* streaming correlator writes only sessions/actions/correlations/unexplained findings to Postgres; ingestion's Postgres firehose write is **removed** (ClickHouse-only); the on-demand read path (`routes/sessions.ts`) sources candidate events from ClickHouse.
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
- [ ] **Slice 5 — Forensic query/replay surface (T4).**
  - *Delivers:* an API endpoint serves a session's full correlated trace (declared actions + attributed syscalls + verdict) from ClickHouse; the dashboard renders it for audit/replay.
  - *Acceptance:* the endpoint returns the full trace shape for a known session; the dashboard renders it.
  - *Test:* endpoint returns trace for a seeded session; light UI render check.
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slices 2, 3.
- [ ] **Slice 6 — Migration + cost validation (T5).**
  - *Delivers:* demo data cutover; a recorded measurement of ClickHouse storage/query cost vs. the ~1.4M-row Postgres-firehose baseline (the documented "store the gap" win); SPEC_01/02 correlation tests pass **unmodified**.
  - *Acceptance:* recorded check shows Postgres row growth ∝ findings (orders of magnitude below captured syscall count); SPEC_01/02 baselines unchanged.
  - *Test:* recorded cost/row-growth check + SPEC_01/02 fixtures pass without modification.
  - *DoD:* test green · `keel eval` green · spec/docs updated · within PR-size budget.
  - *Depends on:* Slices 1–4.

**Risks:** (1) Slice 2 PR-size — reuse scoring signals untouched; split if it overflows. (2) ClickHouse testability under the coverage gate — injectable client → fake for unit/patch-coverage, compose-gated integration. (3) Correlator restart → **rehydrate open windows from ClickHouse** (decided). (4) Two correlation paths during cutover (2→3) must produce identical scores — SPEC_01/02 baselines are the guardrail. (5) ClickHouse TTL/partition DDL — verify against official ClickHouse docs (source-driven), not memory.
