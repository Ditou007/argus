# Argus Specs — Start Here

Specs are the source of truth for Argus subsystems. Each spec is `Goal · Tasks · Done`,
written before the code and kept true as the code changes. The `## Plan` section is added
by the Plan phase (`/keel:plan`) and ticked off slice by slice during Build.

**Last updated:** 2026-06-14

## Index

| Spec | Subsystem | Status |
|---|---|---|
| [SPEC_01](./SPEC_01_correlation_accuracy.md) | Correlation engine — accuracy harness & unexplained-behavior detection | 🟢 Planned (Build in progress) |

## Conventions

- One spec per subsystem, `SPEC_NN_snake_case.md`.
- A spec is **Done-ready** when every line under `## Done` can become a failing test.
- Changing a spec'd subsystem touches its spec in the same diff (enforced by `spec-sync` where configured).
