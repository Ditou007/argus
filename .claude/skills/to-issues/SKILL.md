---
name: to-issues
description: Optionally mirror a committed plan onto a tracker board — one issue per shippable slice, with acceptance criteria and dependencies. Use after planning, only if you keep an issue tracker.
---

# to-issues

**Optional, and purely additive.** The plan is already durable — `/keel:plan` commits it into the spec's `## Plan` section, so it survives session close on its own. Run this only when you also keep a board (Linear, GitHub Issues) and want the slices mirrored there as assignable, trackable issues. One issue = one vertical slice from `plan-and-breakdown`. Skip it entirely if the committed `## Plan` is enough.

## Process

1. **One issue per slice.** If a slice is too big for one issue, it was too big for one slice — re-split.
2. **Each issue carries:** the user-facing outcome, the acceptance criteria (the slice's named test), the dependencies (blocks/blocked-by), and the relevant spec link.
3. **Title in the change's shape** — `type(scope): outcome`, so the eventual commit/PR follows.
4. **Order by dependency**, value-first, mirroring the plan's sequence.
5. **Label** by area/seam from the project's taxonomy so the board stays navigable.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "One big issue is simpler." | A big issue becomes a big PR that fails the size gate. Slice it. |
| "I'll remember the dependencies." | The board is the shared memory; unstated deps become merge-order surprises. |
| "Acceptance criteria are obvious." | If they're obvious, writing them costs nothing and they become the test. Write them. |

## Red flags

- An issue with no acceptance criteria.
- An issue that would produce a PR over the size budget.
- Dependencies implied but not linked.

## Verification

- Each issue maps to exactly one slice with named acceptance criteria.
- Dependencies are linked; order matches the plan.
- Titles follow the commit shape.
