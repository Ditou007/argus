# SPEC_04 — Storage & Forensic Architecture (store the gap, retain the trace)

**Subsystem:** `packages/ingestion/**` (event write path) · `packages/api/src/correlation/**`
(correlation + findings) · a new columnar event store (ClickHouse-class) · `docker-compose.yml`
(new store service) · retention/TTL config.
**Last updated:** 2026-06-22
**Status:** 🟡 Define (DRAFT outline — needs a proper `/keel:spec` Define interview before Plan/Build).
Direction is locked by [ADR 0001](../adr/0001-forensic-first-runtime-governance.md); the slicing
below is provisional.

---

## Why (problem)

Argus currently writes the **entire syscall firehose into Postgres** (≈1.4M rows in the demo).
Storage, ingest, and triage-query cost all scale with the firehose, not with the product's value
(the *gap*). The S3/S4 risk de-noise is **query-time only** — it ranks, it does not reduce what is
stored. This does not scale, and it does not match Argus's forensic-audit identity.

## Goal

Make durable storage proportional to **what matters** while **retaining a queryable forensic trace**:
the raw syscall firehose and the correlated traces live in a **columnar store (ClickHouse-class)** with
a configurable TTL (~30 days → the EU AI Act 6-month floor); **Postgres holds only** sessions, declared
actions, correlations, and risk-ranked **unexplained** findings (the product surface + index). Postgres
never ingests the firehose. The result: a cheap, time-bounded audit record + a fast findings index —
the storage shape a forensic governance/audit product needs.

## Architecture (target)

```
agent (SDK)        Tetragon (eBPF)        ingestion            columnar store (ClickHouse-class)
  └─ declares ───► captures syscalls ───► writes RAW events ──► events + correlated_traces (TTL)
       │                                        │
       ▼                                        ▼  (on action-end OR streaming)
   Postgres ◄──────────────── correlator queries the store for the action's PID/time window,
   sessions · actions · correlations · findings (the gap + index)  writes only the FINDING ──► Postgres
```

Key rule: **ingestion → columnar (raw); correlator → Postgres (findings only).** The columnar store is
the system of record for the trace; Postgres is the system of record for the findings/surface.

---

## Tasks (provisional vertical slices — confirm in Define)

- **T1 — Columnar store wired into compose.** Add a ClickHouse-class service; ingestion writes raw
  events there instead of (or in addition to) Postgres. Prove capture lands + is queryable.
- **T2 — Correlator reads the store, writes findings to Postgres.** On action-end (or streaming),
  query the columnar store for the PID/time window; persist only sessions/actions/correlations/findings
  to Postgres. Postgres firehose write path removed.
- **T3 — Retention/TTL + partitioning.** Configurable TTL on raw + traces (default toward the EU 6-mo
  floor); time-partitioned; old partitions auto-drop.
- **T4 — Forensic query/replay surface.** API + UI can pull a session's full correlated trace from the
  columnar store for audit/replay (the "what did the agent actually do" record).
- **T5 — Migration + cost validation.** Move existing/demo data; measure storage + query cost vs. the
  Postgres-firehose baseline; document the win.

## Done (draft acceptance — each becomes a test/recorded check)

- [ ] Raw syscall events + correlated traces are stored in the columnar store, not Postgres; a fresh
  `docker compose up` captures into it and serves a session trace.
- [ ] Postgres holds only sessions/actions/correlations/findings; row growth is proportional to
  findings, not firehose (demonstrated against the ~1.4M-row baseline).
- [ ] TTL expires raw events after the configured window; findings persist independently.
- [ ] A session's full correlated trace is queryable for audit/replay.
- [ ] `keel eval` green; SPEC_01/02 correlation behavior and baselines unchanged (this is a storage/
  retention change, not a scoring change).

---

## Open questions (resolve in the Define interview)

1. **Engine:** ClickHouse specifically, or an embeddable/lighter columnar option to keep the
   `docker compose` demo footprint small? (Demo simplicity vs. production realism.)
2. **Correlation timing:** at action-end (simple, has an ingestion-lag race for fast ops — known from
   SPEC_03) vs. true streaming correlation (more complex, lower latency).
3. **Dual-write vs. single-write during migration:** keep Postgres raw temporarily for safety, or cut over?
4. **Retention default + configurability:** 30d? 6-mo (EU floor)? per-tenant? sampling of benign noise?
5. **Intent-capture fork (cross-cutting, may be its own spec):** keep SDK-declared only, or add an
   AgentSight-style instrumentation-free TLS-interception capture mode for coverage?
6. **Enforcement (explicitly OUT of this spec):** observe→alert only; soft enforcement is a later spec
   (return-error/pause at the action boundary, never SIGKILL) per ADR 0001.

## Non-goals

- **No enforcement / kill switch** (ADR 0001 — observe-first; later spec for soft enforcement).
- **No scoring change** — correlation/risk behavior is unchanged; this is purely where/how long data lives.
- **Not the intent-capture redesign** — SDK vs. TLS interception is tracked separately.
