---
name: spec-driven
description: Specs are the source of truth. Before building a subsystem, write/own its spec — Goal · Tasks · Done — and keep it true as code changes. Use when defining or changing any subsystem's behavior.
---

# spec-driven

A spec is the contract between intent and code. Code that drifts from its spec is a bug in one of them. The spec is written **before** the code and kept true **as** the code changes — never reconstructed afterward.

## Process

1. **One spec per subsystem**, named `SPEC_NN_snake_case.md`, indexed from a `SPEC_00` start-here. Use the `docs-system/SPEC.template.md` scaffold.
2. **Three mandatory sections:**
   - **Goal** — the outcome in one sentence + why it matters.
   - **Tasks** — atomic, vertically-sliced steps; each independently shippable and testable.
   - **Done** — acceptance criteria phrased so each becomes a test.
3. **Wire spec-sync** for subsystems that must never drift: add `{ when, requireTouched }` to `docs.specSync.rules` in `keel.config.json` so changing the code without touching the spec fails the gate.
4. **Stamp** `**Last updated:**` and a status banner; bump on every change.
5. **When the subsystem changes, the spec changes in the same diff** — not "later".

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "The code is the spec." | Code says *how*, not *why* or *what's intended*. The next person (or you in six months) needs the contract, not a re-derivation. |
| "I'll write the spec after it works." | Then it's documentation of an accident, not a contract. The Done criteria are your tests — they come first. |
| "This change is too small for a spec touch." | Small behavior changes are exactly the ones that silently invalidate a spec. spec-sync will catch it; do it yourself first. |

## Red flags

- A PR that changes a subsystem's behavior with no spec file in the diff.
- A spec whose "Done" can't be turned into tests (too vague).
- Two specs describing the same subsystem (split or merge — one source of truth).

## Verification

- `keel spec-sync` passes for the diff.
- Each "Done" criterion maps to a named test.
- The spec's `**Last updated:**` is today.
