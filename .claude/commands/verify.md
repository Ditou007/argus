---
description: Verify phase — prove the change two ways. First the automated safety net (the right tests across three tiers, green, with the diff covered); then exercise the RUNNING artifact for real (the installed/adopted thing, not just the source), fix-and-reverify each issue, codify the flows into e2e, and end with a ship-readiness verdict.
argument-hint: [tier — quick | standard | exhaustive; defaults to standard]
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(npx:*), Bash(git:*), Bash(node:*)
---

You are in the **Verify** phase. A change is proven two ways, and you do both here: the **tests** prove it *should* work, and **running the thing** proves it *does*. Tests passing is not "it works" — that's a claim until you've exercised the real artifact and watched it behave. Verify ends only when both halves are green: the right tests exist and cover the diff, **and** the running artifact was driven for real, every issue fixed-and-reverified, with an e2e left behind so it can't come back.

- **Tier (for the live pass):** $ARGUMENTS (default: `standard`)
- **Patch coverage right now:** !`npx --no-install keel coverage 2>&1 | tail -3 || echo "run the tests with coverage, then: pnpm exec keel coverage"`
- **Gate baseline:** !`npx --no-install keel eval 2>&1 | tail -5 || echo "run: pnpm exec keel eval"`
- **Files this diff touches:** !`git diff --name-only "$(git merge-base HEAD origin/main 2>/dev/null || echo HEAD~1)"..HEAD 2>/dev/null | head -20`

First read `.claude/skills/testing/SKILL.md` (the test tiers + coverage) and `.claude/skills/qa/SKILL.md` (the live-exercise discipline — what to test, how to prove it) and `.claude/skills/verify-live/SKILL.md` (the driver — how to drive the running app). For any failure, `.claude/skills/debug-rootcause/SKILL.md`.

## Do

### Part A — the automated safety net (tests + coverage)

1. **Three tiers.** Confirm the change has the tests its tier needs: **unit** (colocated, the bulk), **cross-cutting e2e** (the root `tests/` workspace — real-HTTP / integration), and **browser e2e** (`e2e/` — only for UI-facing flows). A feature isn't done until the tiers it warrants exist.
2. **Patch coverage.** Run the test runner with coverage, then `keel coverage`. It checks the lines THIS diff added against `coverage.min` — not the whole repo. Cover the new branches, not just the happy line.
3. **Root-cause failures.** Iron law: no fix without a root cause. If a test fails, find why it fails before changing anything — don't pattern-match a patch.

### Part B — exercise the running artifact for real

4. **Pick the driver — by probing, not assuming. keel ships no browser of its own.** keel is the QA *discipline + the e2e it leaves behind*, not a bundled engine. Detect the best driver actually present and use it, in this order:
   - **gstack `/qa` + `/browse`** if installed (a `/browse` skill is in context, or `~/.claude/skills/gstack` exists) — the preferred web driver. It is **optional**: keel never requires it, and repos without it fall through. If you *do* have it, prefer it for any web UI.
   - else the **project's own e2e runner** — grep `package.json` for `playwright` / `cypress` / `@web/test-runner` / vitest browser mode, plus a `dev`/`start`/`serve` script — and drive it (headed where it helps).
   - else **HTTP** — `curl` or a Node `fetch` script for a server/API, or the **built CLI/library** invoked for real (step 5).
   - else, last resort, **scripted manual steps the human runs**, with results captured.
   State which driver you picked and why. **Never skip the live pass for lack of a tool** — but if manual was the only option, say so in the verdict (step 9): that's *degraded* QA, not green QA.
5. **Exercise the REAL artifact, not just the source.** This is where the bugs that pass every unit test live. For a web change: the running app. For a published **CLI/library/tool**: install or adopt the *built* package into a throwaway dir and use it for real — a fresh `npm install` + the actual commands. (keel found its own node_modules / base-branch / version bugs exactly this way; a unit suite never would.)
6. **Run the tiered `qa` discipline** against that running artifact: critical path → edge → error/empty → responsive/a11y → regression (blast radius). Tier scopes how deep: `quick` (critical/high), `standard` (+ medium), `exhaustive` (+ cosmetic). Don't batch — fix as you find.
7. **Fix the clear ones; escalate the judgment calls — this is the balance.** A finding is **clear** when it's an objective defect (crash, error, wrong output, broken flow, a bug a unit test would assert): root-cause it (`debug-rootcause`), fix it as a **gated slice** (`keel eval` green, behavior-preserving for a refactor), and re-verify the same step. A finding needs **human judgment** when it's subjective or ambiguous — "is this UX acceptable?", "is this severity ship-blocking?", "is this a bug or intended?", or anything you're genuinely unsure about. **Don't guess and don't auto-fix those** — capture them with evidence and a recommendation, and bring them to the human. Automate the mechanical; surface the judgment.
8. **Codify into e2e — a live pass that leaves no test gets re-found.** Turn each confirmed flow (and each fixed bug) into an e2e test against the real artifact, so it's regression-proof. This is how the live pass feeds the suite — and satisfies the `e2e` gate check for the feature.
9. **Report + a verdict the human signs off.** Present a report: which **driver** you used, what was exercised, findings **fixed** (with before/after), findings **open** needing a judgment call (evidence + your recommendation each), and a **proposed** ship-readiness verdict — ship-ready / issues-remaining. Two hard rules on the verdict: (a) **no "ship-ready" without proof** — you must have captured evidence the *real running artifact* was exercised (commands + actual output/response/screenshot) **and** left a passing e2e behind (`check-e2e` enforces this for a feature on the gate); a verdict resting only on "tests pass" or "looks right" is not ship-ready. (b) if the only available driver was **manual**, label the verdict **degraded QA** and say what wasn't automatically exercised. The verdict is a *recommendation*, not a decision: surface the judgment calls and let the human confirm (same principle as "merging is the human's call"). Never declare green you didn't observe, and never silently decide a subjective call for them.

## Done when

**Part A:** all three relevant test tiers pass, `keel coverage` meets the bar, and any failure was fixed at its root with a regression test. **Part B:** a real driver was chosen by probing (gstack if present, else the project's runner, else HTTP, else manual) and named; every tier in scope was exercised against the **running** artifact (not a mock, not just the suite) with captured evidence; clear defects were fixed-and-reverified; judgment calls were surfaced to the human with evidence + a recommendation rather than auto-decided; the flows are codified as e2e tests (a green verdict requires a passing e2e, not just "tests pass"); `keel eval` is green; and the human has signed off on the ship-readiness verdict (labelled *degraded* if it could only be manual). Then chain to `/keel:review`.
