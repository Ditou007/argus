---
description: Ship phase — auto-fix the mechanical issues, commit (conventional), record the changeset, open the PR, then watch CI and iterate until green. Stops at an open PR — merging is manual unless told otherwise.
argument-hint: [PR title — type(scope): subject]
allowed-tools: Read, Edit, Write, Bash(git:*), Bash(gh:*), Bash(npx:*)
---

You are in the **Ship** phase. The change is reviewed and the gate is green locally. Now land it cleanly and don't walk away until CI is green.

## State right now

- **Proposed PR title:** $ARGUMENTS
- **Branch:** !`git branch --show-current 2>/dev/null`
- **Working tree:** !`git status --short 2>/dev/null`
- **Gate:** !`npx --no-install keel eval 2>&1 | tail -10 || echo "run: pnpm exec keel eval"`
- **Open PR (if any):** !`gh pr view --json url,state,title 2>/dev/null || echo "no PR yet / gh unavailable"`

First read `.claude/skills/commits/SKILL.md` and `.claude/skills/changesets/SKILL.md`.

## Do

0. **Confirm Verify and Review actually ran — Ship presupposes them, it doesn't replace them.** If this change came straight from Build without a `/keel:verify` (tests + a live exercise of the running artifact, e2e left behind) and a `/keel:review` (the adversarial pass), **stop and run them now**, before anything else. Ship is for landing a *verified, reviewed* change; the gate (`keel eval`) is the floor, not a substitute for either phase. Don't skip them because the change "looks small."
1. **Auto-fix the mechanical issues first.** Run `keel fix` — it applies `eslint --fix` over just your diff, clearing the formatting/quotes/import-order/unused-import problems so you never hand-fix what a tool can. It's an action, not a gate: it never touches untouched legacy, never rewrites logic, and always exits clean. Whatever it can't fix is left for the next step.
2. **Pre-flight the gate:** `keel eval` (its current result is above). Anything still red *after* the auto-fix is a real issue that needs judgment — root-cause and fix it. **Never weaken a threshold, grandfather a violation, or disable a check to go green.** Never push red.
3. **Changeset.** If the change touches a published package (`changesets.publishedGlobs`), add a `.changeset/*.md` describing it — the drift ledger. The gate's changeset check enforces this.
4. **Commit** in Conventional Commit form — `type(scope): subject`, subject lower-case, no trailing period, header ≤ `commits.headerMaxLength`. Scope from `commits.scopes` when set. One logical change per commit. (Use the proposed PR title above if given.)
5. **Branch + push.** Never commit straight to a base branch. Open a PR; fill every required section of the PR template.
6. **Watch CI and iterate — do not stop at "pushed".** Poll the checks. On failure:
   - Read the actual failing log; root-cause it (don't blind-retry).
   - Fix locally (re-run `keel fix` if it's a mechanical regression), re-run `keel eval`, push the fix.
   - Repeat until **all checks are green**.
   Use `/loop` to poll on an interval if the run is long, or watch the run directly. Report the final green state — or, if a failure is genuinely external/infra (not your change), say so explicitly with evidence rather than forcing a merge.
7. **Watch reviewer feedback too — not just CI.** Automated reviewers (Gemini Code Assist, CodeRabbit, …) and humans post comments asynchronously after the PR opens. Once CI is green, run `/keel:address-review` to triage and resolve that feedback (fix the valid ones test-first, reply with reasoning to the rest), and keep polling until a round surfaces nothing new. **This is the job, not a question** — never hand back asking "should I watch CI / address the review?"; just do it, and return only for a genuine blocker or a human-only decision.
8. **After an authorized merge — watch the release to green.** *Only* once the human has merged (or explicitly told you to): the merge to the base triggers the automatic release (CD). Watch that run to green and **confirm the published version/tag** — don't hand back at "merged." If the release fails, root-cause it like any other gate failure. (This is the one step that runs past the open PR, and only on the human's merge — pre-merge you still stop at the open green PR.)

## Done when

The PR is open, **every CI check is green**, and **reviewer feedback is resolved** (each comment fixed or answered) — verified, not assumed, and never offered back as a "want me to watch?" question. **Stop at the open green PR** — merging is the human's call: do **not** merge unless the user has explicitly told you to in this session. Once they authorize the merge, follow through: watch the release/CD to green and confirm the published version before reporting done. Never self-merge without that authority.
