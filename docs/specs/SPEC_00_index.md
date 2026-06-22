# Argus Specs — Start Here

Specs are the source of truth for Argus subsystems. Each spec is `Goal · Tasks · Done`,
written before the code and kept true as the code changes. The `## Plan` section is added
by the Plan phase (`/keel:plan`) and ticked off slice by slice during Build.

**Last updated:** 2026-06-22

## Index

| Spec | Subsystem | Status |
|---|---|---|
| [SPEC_01](./SPEC_01_correlation_accuracy.md) | Correlation engine — accuracy harness & unexplained-behavior detection | 🟢 Build complete (all 11 slices + HTTP-contract tests merged) |
| [SPEC_02](./SPEC_02_trustworthy_unexplained.md) | Trustworthy unexplained-behaviour — pod-scoped capture, risk-ranked triage, D14 write attribution | 🟢 Moat delivered (Slices 1–6 + 2b on main; D15/OTel deferred → backlog) |
| [SPEC_03](./SPEC_03_live_demo.md) | Live interactive demo — `docker compose up`, attackable chatbot agent, chat + live Argus view, honest README | 🟢 Complete (all 6 slices; one-command attack-and-catch demo) |
| [SPEC_04](./SPEC_04_storage_and_forensic_architecture.md) | Storage & forensic architecture — ClickHouse firehose+traces, Postgres findings/index, streaming correlation, tiered retention | 🟢 Define complete (decisions locked; ready for Plan; see [ADR 0001](../adr/0001-forensic-first-runtime-governance.md)) |

## Conventions

- One spec per subsystem, `SPEC_NN_snake_case.md`.
- A spec is **Done-ready** when every line under `## Done` can become a failing test.
- Changing a spec'd subsystem touches its spec in the same diff (enforced by `spec-sync` where configured).
