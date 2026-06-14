---
name: plan-and-breakdown
description: Decompose a spec into atomic, vertically-sliced, dependency-ordered steps, pressure-tested through product/eng/design lenses. Use in the Plan phase before writing code.
---

# plan-and-breakdown

A plan is a sequence of slices, each independently shippable and small enough to review. Bad plans are horizontal ("all models, then all routes"); good plans are thin vertical slices that each deliver something testable end-to-end.

## Process

1. **Slice vertically.** Each slice cuts through every layer to deliver one observable behavior. Each must fit under `prSize.fail` — if it can't, it's two slices.
2. **Order by dependency**, earliest-value first. The first slice should be a thin end-to-end path, not scaffolding.
3. **Write each slice as a task contract** — self-contained enough to build without re-deriving intent:
   - **Delivers (expectation):** the one observable behavior shipped.
   - **Acceptance criteria:** concrete, testable conditions (each becomes an assertion; cover error/empty/edge).
   - **Test:** the named test the Build phase writes red-first.
   - **Definition of Done:** test green · `keel eval` green · spec/docs updated · within the PR-size budget.
   - **Depends on:** earlier slices, if any.

   Every task's acceptance criteria trace back to a spec **Done** line — a task with no spec criterion behind it means the spec is incomplete.
4. **Three lenses:** Product (is this the right thing? a 10× simpler shape?) · Engineering (data flow, edge cases, failure modes) · Design/DX (the consumer's experience).
5. **Surface risks** explicitly; don't bury the scary slice.
6. **Get the human's sign-off, then commit the plan into the spec.** Present the sliced plan — slices, sequencing, risks, close calls — and fold in revisions; the three-lens pressure-test above is self-review, not approval, so **don't commit a plan the human hasn't approved.** Once signed off, write the sequenced slices into the spec's `## Plan` section as an unchecked checklist (`- [ ]`, one slice per line in the contract shape above) and commit it — `docs(plan): <subsystem> — slice breakdown`. That committed section is the durable plan: it survives session close, and `/keel:build` walks it top-down, ticking each slice `[ ]` → `[x]` as it ships, so the spec doubles as the live progress board. (A plan that lives only in the conversation dies with the session — committing it into the spec is what fixes that.)

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "I'll just build it, planning is overhead." | Unplanned work becomes a 40-file PR no one can review. The plan is what keeps PRs small. |
| "Horizontal is more efficient." | Horizontal delays all value to the end and hides integration risk until it's expensive. |
| "We'll find the edge cases while coding." | The ones you find late are the ones that ship as bugs. Name them now. |

## Red flags

- A slice that can't be tested on its own.
- A plan with no risks listed (you haven't looked hard enough).
- Estimated PRs over the size budget.

## Verification

- Each slice is a task contract: expectation · acceptance criteria · named test · definition of done.
- Every task's acceptance criteria trace back to a spec Done line.
- Each slice fits the PR-size budget; slices are dependency-ordered, value-first.
- Risks are written down.
- The plan is written into the spec's `## Plan` section as a checklist and committed (`docs(plan): …`) — not left in the conversation.
