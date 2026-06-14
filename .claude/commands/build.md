---
description: Build phase — implement the next slice from the committed plan test-first, to the code-craft bar the gate enforces, and tick it off.
argument-hint: [spec path, or a single slice]
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(git status:*), Bash(npx:*)
---

You are in the **Build** phase. Implement exactly one slice from the plan.

- **Target:** $ARGUMENTS — a spec path (walk its `## Plan`), or a single named slice. If empty, find the spec whose `## Plan` has unchecked slices.
- **Working tree right now:** !`git status --short 2>/dev/null || echo "(not a git repo)"`

First read `.claude/skills/tdd/SKILL.md` and `.claude/skills/code-craft/SKILL.md`.

## Do

0. **Pick the slice.** Open the spec's `## Plan` and take the **first unchecked (`- [ ]`) slice whose dependencies are all checked** — that's this PR's one slice. Build its contract exactly; don't pull work from later slices.
1. **Red.** Write the failing test for this slice's acceptance criterion first. A new logic file with no matching test fails the gate's TDD check — so the test exists before the code, by construction.
2. **Green.** Write the minimum code to pass.
3. **Refactor** to the code-craft bar: no magic values (named const / enum / config), pure logic with I/O at the edges (dependency-injected), immutability (no mutating arguments or shared state), structured logging with an `event` field (never `console.*`), explicit error handling. Respect the line limits in `keel.config.json` (`limits.fileLines` / `functionLines` / `componentLines`) — split when exceeded.
4. **Stay diff-clean.** Run `keel fix` to auto-clear the mechanically-fixable lint (formatting, quotes, import order, unused imports) on your diff, then hand-fix only what it can't — the lint ratchet blocks any warning on a line you added or changed. Don't leave it for review.
5. **Touch the spec** if behavior changed (spec-sync will enforce it).
6. **Tick the slice off.** In the **same** change, flip this slice's line in the spec's `## Plan` from `- [ ]` to `- [x]`, so the committed plan always shows what's done and what's next — a reopened session resumes from the first unchecked slice without re-deriving intent.

## Done when

The slice's test passes, `keel lint` and `keel tdd` are clean on the diff, the spec reflects reality, **and this slice is checked off in the spec's `## Plan`**. Then either build the next unchecked slice or chain to `/keel:verify`.
