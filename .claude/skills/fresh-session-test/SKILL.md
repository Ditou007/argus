---
name: fresh-session-test
description: Validate onboarding and docs from zero — a clean clone / fresh context follows only the written instructions and records every gap. Use after changing setup, quick-start, adopt, or onboarding docs.
---

# fresh-session-test

A forward gap: docs are written by people who already know the answer, so they silently assume it. The only way to find the assumption is to follow the instructions from zero, with no prior knowledge.

## Process

1. **Start clean.** A fresh clone (or a fresh agent context that hasn't seen the work) follows *only* what's written — README, quick-start, `keel init`, the CLAUDE.md block. No filling in gaps from memory.
2. **Do exactly what it says**, in order. When a step assumes knowledge that isn't written, **stop and record it** — that's a doc bug, not a you-problem.
3. **Time-to-hello-world.** Note how long from clone to the first working command. If it's surprising, the docs buried something.
4. **Every gap becomes a doc fix**, applied in the same pass.
5. **Re-run after the fix** to confirm the path is now clean end-to-end.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "I know the missing step, I'll just do it." | Then the doc still has the hole for the next person. Record it and fix the doc. |
| "It's obvious you need to run install first." | Obvious to you, who built it. The fresh reader has only the page. |
| "The happy path works, ship the docs." | The fresh path *is* the happy path for everyone who didn't write it. Walk it. |

## Red flags

- An onboarding step that "everyone knows" but isn't written.
- A quick-start that wasn't run from a clean state since the last change.
- A gap found and worked around instead of fixed in the doc.

## Verification

- A clean clone reaches the first working command using only the written steps.
- Every gap encountered was fixed in the docs in the same pass.
- The path was re-run clean after fixes.
