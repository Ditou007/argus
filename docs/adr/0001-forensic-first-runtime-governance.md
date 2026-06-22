# ADR 0001 — Forensic-first runtime governance & audit for AI agents

**Status:** Accepted · **Date:** 2026-06-22 · **Deciders:** Argus maintainer

## Context

Argus correlates an AI agent's **declared intent** (SDK `llm_call` / `tool_use`) with the
**real syscalls** it produced (via eBPF/Tetragon) and surfaces the **undeclared, risk-ranked
gap** as "unexplained" behavior. SPEC_01–03 proved this works end-to-end (live `docker compose`
demo: a prompt-injected agent reads `/root/.ssh/id_rsa` and exfiltrates; Argus flags it HIGH).

Two verified deep-research passes (2026-06-19 market/competitor, 2026-06-22 fundability) reshaped
the picture:

- The "intent vs behavior" gap is **real and validated**, but **not empty whitespace** — *AgentSight*
  (arXiv 2508.02736, Aug 2025) is a peer-reviewed eBPF prototype with nearly the same architecture
  (it derives intent by intercepting TLS LLM traffic rather than from an SDK).
- The strongest enterprise incumbent (**Microsoft Agent Governance Toolkit**, Apr 2026) owns
  **inline enforcement** (block-before-execute at the agent-action layer).
- Demand is present but early; **EU AI Act** Art. 12/19/26 reward **retained, queryable audit trails**
  (6-month floor for high-risk systems).
- VC money clusters on **governance / control-plane / enforcement**; there is **no funded comparable
  for the eBPF/syscall-forensics wedge** — an open, partly category-creating lane.
- Current storage dumps the **full syscall firehose into Postgres** (≈1.4M rows in the demo); today's
  risk de-noise is query-time only and does **not** reduce storage. Unsustainable at scale.

## Decision

1. **Identity: forensic-first "runtime governance & audit for AI agents."** Correlate intent↔syscalls
   and retain a queryable audit record of declared vs. actual behavior. This is the differentiated,
   least-contested lane (Microsoft owns enforcement; AgentSight validates forensic; regulation rewards
   retained audit).

2. **Storage: a columnar firehose store (ClickHouse-class) for raw events + correlated traces, with
   Postgres holding only the findings + index.** Raw syscalls and correlated traces → columnar store
   with TTL (~30d→6mo). `packages/api/src/correlation/**` writes only sessions, declared actions,
   correlations, and risk-ranked unexplained findings to Postgres. Postgres never ingests the firehose.
   (Mirrors observability tools like SigNoz: telemetry in ClickHouse, metadata relational.)

3. **Enforcement: observe-first; never kernel SIGKILL.** A ladder where v1 never needs the top rung —
   **(1)** observe (forensic, the moat) → **(2)** real-time alert (same pipeline) → **(3)** *later, if
   ever* soft enforcement (return-error / deny / pause-for-approval at the agent-action boundary),
   **never** a kernel-level kill. Already the SPEC_02 backlog stance ("return-error-first, never SIGKILL").

## Options considered

- **Enforcement-first (compete with Microsoft).** Rejected: out-engineering Microsoft on sub-ms inline
  blocking is a losing fight; killing prod agents has high adoption/trust cost; the syscall layer is the
  wrong place to block gracefully.
- **Store-only-the-gap (EDR/alert-centric).** Rejected as the *primary* model: discards the forensic/
  audit value the differentiated identity and EU AI Act both reward. (Retained as the surfacing layer
  *on top of* the trace.)
- **Postgres-only firehose (status quo).** Rejected: storage/ingest/query cost scales with the firehose,
  not the findings.

## Consequences

- **Positive:** differentiated vs. both incumbents and the research analog; observe-only has near-zero
  blast radius → easier design partners → better fundability; retained traces satisfy audit/compliance;
  the "governance" narrative VCs fund is told via detect + audit + alert (enforcement parked on roadmap).
- **Costs / risks:** introduces a columnar store as a new infra dependency (operational + demo-footprint
  cost); SDK-declared intent requires instrumentation and can be bypassed by an agent that simply never
  declares — an instrumentation-free capture mode (à la AgentSight's TLS interception) is an open fork;
  enforcement is deferred, so "governance" must be framed honestly as detect/audit now.

## Follow-ups

SPEC_04 specifies the storage/retention + forensic architecture (the ClickHouse/Postgres split and
correlation flow). Intent-capture mechanism (SDK vs. TLS-interception vs. both) and go-to-market/region
remain open.
