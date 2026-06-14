---
name: living-docs
description: Root docs are living docs — a stale claim is a bug. Keep build-status single-sourced, CLAUDE.md/AGENTS.md twins in sync, and every backticked path alive. Use after any change that affects behavior, status, or structure.
---

# living-docs

Docs are code: stale claims are defects, not cosmetics. keel enforces the mechanical layer (`doc-sync`); you own the semantic layer.

## Process

1. **Single source of truth for build status.** One canonical section (e.g. `docs/architecture.md` "Build status & deferred work"). Every other surface *links or mirrors* it — never re-proses status. When a feature's status flips (deferred ↔ partial ↔ built), update the canonical section and its mirrors in the **same change**.
2. **CLAUDE.md ↔ AGENTS.md are twins.** Same rules, two audiences. A change to one (a rule, the layout, the stack table, quick-start) mirrors to the other in the same change.
3. **The change→docs matrix.** When you change X, update docs Y, Z (see `docs-system/DOC-MATRIX.md`) and bump each `**Last updated:**`.
4. **SECURITY.md states guarantees AND honest "Known gaps."** A gap omitted reads as a control that exists — never let that happen.
5. **Every backticked multi-segment path in tracked markdown must resolve.** `doc-sync` enforces it; fix the path, don't delete the sentence.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "The README is just an intro, it can lag." | It's the first thing a human and an agent read. A false claim there misleads every future decision. |
| "I updated the canonical status; the mirrors are obvious." | If they were obvious they wouldn't drift. Update them in the same change or they rot. |
| "The dead path is in an example." | Then mark it illustrative (glob/`<placeholder>`) or add a `docSyncIgnore` entry — don't leave a literal dead path. |

## Red flags

- A doc says "on the roadmap" / "deferred" for something that shipped.
- A security gap that exists in code but not in SECURITY.md "Known gaps".
- A rule changed in CLAUDE.md but not AGENTS.md.

## Verification

- `keel doc-sync` is green.
- The build-status mirrors agree with the canonical section.
- Every doc you touched has today's `**Last updated:**`.
