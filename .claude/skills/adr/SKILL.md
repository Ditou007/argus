---
name: adr
description: Capture an architecture decision as an ADR — context, the decision, options considered, consequences — so the why survives. Use when making a non-obvious, hard-to-reverse technical choice.
---

# adr

A decision not written down is relitigated every six months. An ADR records *why* a choice was made — the context and the alternatives — so the next person inherits the reasoning, not just the result. Use the `docs-system/ADR.template.md` scaffold.

## Process

1. **Write one when the choice is real** — non-obvious, costly to reverse, or affecting multiple parts of the system. Skip it for obvious defaults.
2. **Number and title** it `ADR_NNN_short_title.md`; status starts `Proposed`, becomes `Accepted` (or `Superseded by ADR_MMM`).
3. **Context** — the forces: the problem, the constraints, what makes this genuinely a decision.
4. **Decision** — the choice, stated plainly ("We will…").
5. **Options considered** — the real alternatives with pros/cons, so the reader sees what was weighed and rejected. An ADR with one option is a decree, not a decision record.
6. **Consequences** — what becomes easier AND harder, the cost you're accepting. Honest, not just the upside.
7. **Index it** in `architecture.md` and link it from the affected SPEC.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "Everyone knows why we chose this." | Everyone who was in the room. The next hire wasn't. Write it. |
| "I'll document the decision later." | Later the alternatives you rejected are forgotten — and that's the most valuable part. |
| "Just record the choice, skip the options." | Then the reader can't tell if you considered their 'obvious' alternative. Record what you rejected and why. |

## Red flags

- A significant, hard-to-reverse choice with no ADR.
- An ADR with a decision but no rejected alternatives.
- Consequences listing only benefits.

## Verification

- The ADR has context, decision, real options, and honest consequences.
- It's indexed in `architecture.md` and linked from the relevant spec.
- Status reflects reality (Proposed/Accepted/Superseded).
