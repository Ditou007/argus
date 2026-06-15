---
description: Run phase — drive a committed plan's slices through Build → Verify → Review → Ship, one slice to an open green PR at a time, in auto or step mode. Sequential; never merges.
argument-hint: [spec path] [auto|step]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*), Bash(npx:*), Bash(gh:*)
---

You are the **Run** driver. You don't build anything yourself — you walk a committed plan's slices through the rest of the lifecycle, one at a time, invoking each phase command in turn.

- **Spec:** $ARGUMENTS — the spec whose `## Plan` you'll drive (and, optionally, the mode `auto`|`step`). If no spec is given, ask which one.

First read `.claude/skills/plan-and-breakdown/SKILL.md` (so you understand the slice/`## Plan` contract you're walking).

## Do

1. **Load the plan.** Read the spec's `## Plan` section. The slices are your worklist, top-down. If there is no `## Plan`, stop and route to `/keel:plan` — there's nothing to drive yet.
2. **Pick the mode — once, up front.** If not given as an argument, ask (default **step**):
   - **step** — drive **one slice** all the way to an open green PR, then **stop and wait** for the human's go-ahead before the next slice.
   - **auto** — drive **every** remaining slice, continuing to the next one **only after the current slice's PR is green**.
   Confirm the chosen mode out loud before starting.
3. **Select the next slice — one slice, one PR.** Take the **first unchecked (`- [ ]`) slice whose `Depends on` are all checked**. Never start a slice whose dependencies aren't satisfied — the plan is dependency-ordered for a reason. Each slice ships as its **own** PR; never bundle slices into one PR. If every slice is checked, you're done (announce it).
4. **Drive that one slice through the lifecycle**, in order, each phase against its own skill/command — **run every phase; never skip Verify or Review because a slice "looks trivial" — that's how regressions ship**:
   - **Build** (`/keel:build`) — implement the slice test-first to the code-craft bar; tick it off in `## Plan` (Build does this by construction).
   - **Verify** (`/keel:verify`) — tests + coverage, then exercise the running artifact; root-cause and fix any failure as a gated slice.
   - **Review** (`/keel:review`) — `ship-check` / security / performance on the diff; address findings.
   - **Ship** (`/keel:ship`) — commit, push, open the PR, then **watch CI to green**.
   - **Address review** (`/keel:address-review`) — CI green is **not** the finish line. Automated reviewers (Gemini Code Assist, CodeRabbit, …) and humans post comments asynchronously after the PR opens, so **keep polling and resolving** — fix the valid ones test-first (which re-runs CI), decline-with-reason the wrong ones, reply on each thread — **until a poll surfaces nothing new**. A slice is "done" only when **CI is green *and* every review comment is resolved**, not before.
   - **If the built slice breaches the PR-size budget** (`prSize.fail` — the `pr-size` gate blocks at Ship), don't force an oversized PR: **split the slice into two in the spec's `## Plan`** (re-slice, the smaller half first), drive the first half to a done PR, and leave the remainder as the next unchecked slice. Slices are sized to fit *at Plan time*, but the gate is the backstop that turns a too-big slice into a second PR rather than one giant one.
5. **Never merge.** The lifecycle ends at an open, green PR with review resolved; merging is always the human's call. Do not merge, even in auto mode.
6. **Then, by mode** — and only once the slice is *done* by the bar in step 4 (CI green **and** review resolved):
   - **step** — report the PR (green + review resolved) and **stop**. Wait for the human to say continue before selecting the next slice.
   - **auto** — loop back to step 3 for the next unchecked slice. Keep going until the plan is fully checked off or a phase blocks on something only the human can resolve (then stop and surface it). Never advance to the next slice while the current PR still has CI red or unresolved review.

## Done when

Every slice in the spec's `## Plan` is checked off and each shipped to an open PR that is **both CI-green and has its review feedback resolved** (auto), or the current slice reached that state and you stopped for the human's go-ahead (step). CI green alone is never the stop signal — review must be resolved too. No slice was ever merged by you, and none was started before its dependencies were green.
