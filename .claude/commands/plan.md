---
description: Plan phase — break the spec into atomic, reviewable slices, pressure-test the approach, and commit the plan into the spec before any code.
argument-hint: [spec path or feature]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*)
---

You are in the **Plan** phase. The output is a sequenced plan committed into the spec, not code.

- **Planning:** $ARGUMENTS — read that spec/intent in full before slicing. (If empty, ask which spec or feature this plans.)

First read `.claude/skills/plan-and-breakdown/SKILL.md`.

## Do

1. **Slice vertically.** Each slice is independently shippable, testable, and small enough to keep the eventual PR under `prSize.fail` (see `keel.config.json`). A slice that can't fit is two slices.
2. **Sequence by dependency**, not by layer. Prefer an end-to-end thin slice first over a horizontal "all the models, then all the routes."
3. **Give every slice a task contract.** Write each slice in the contract shape defined by the `plan-and-breakdown` skill you just read (expectation · acceptance criteria · named test · definition of done · dependencies) — self-contained enough that the Build phase can execute it without re-deriving intent. Trace each task's acceptance criteria back to a **Done** line in the spec; a task with no spec criterion behind it means the spec is incomplete (go back to `/keel:spec`).
4. **Pressure-test with three lenses** before committing:
   - **Product/CEO** — is this the right thing? Is there a 10× simpler shape?
   - **Engineering** — data flow, edge cases, failure modes, the test surface.
   - **Design/DX** — the consumer's experience (API, UI, or CLI).
5. **Name the risks** you're carrying, don't hide them.
6. **Get the human's sign-off — this is a judgment gate, not an auto-commit.** Present the sliced plan: the slices, the dependency order, the named risks, and any close calls (a slice that's borderline over the PR-size budget, an approach you're unsure of). Walk through it and fold in their revisions. **Do not write or commit a plan the user hasn't approved** — the agent's three-lens pressure-test above is self-review, not approval. The loop ends on an explicit "yes, build this" (or a clear override).
7. **Write the approved plan into the spec and commit it.** Once signed off, fill the spec's `## Plan` section (see `docs-system/SPEC.template.md`) with the sequenced slices as an unchecked checklist (`- [ ]`), each in the contract shape and each tracing to a Task/Done line. Then commit just the spec on the spec's branch in Conventional form: `docs(plan): <subsystem> — slice breakdown` (a second commit on top of the `docs(spec):` one — the spec lands clean first, the plan rides on top). The committed `## Plan` is the durable, session-proof source of truth the Build phase walks; nothing here is code, and no PR opens yet (that's Ship).
8. **Optionally** also run `to-issues` to mirror the slices onto a tracker board — purely additive now that the plan lives in the spec; skip it if you don't keep a board.

## Done when

The human has **approved** the sliced plan, and the spec's `## Plan` section holds that ordered checklist of task contracts — each with its expectation, acceptance criteria, named test, and definition of done — every one traceable to a spec Done line, the PR-size budget respected, risks stated, **and the approved plan committed (`docs(plan): …`, no code in it)**. Then chain to `/keel:build` pointing at the spec; from there the lifecycle (Build → Verify → Review → Ship) executes each slice against its contract, ticking it off in `## Plan`, until the spec is fully built out.
