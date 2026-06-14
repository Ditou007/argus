---
description: Refactor-campaign phase — bring a whole existing/legacy repo up to standard as a planned sequence of behavior-preserving, gated slices (never a big-bang rewrite). Specs the target, characterizes current behavior, prioritizes, then drives each slice through the normal lifecycle.
argument-hint: [area or module to refactor — defaults to a whole-repo campaign]
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*), Bash(npx:*)
---

You are running a **refactor campaign**. Goal: raise an existing codebase to keel's standard *without* a big-bang rewrite and without a 4,000-issue dump — a planned sequence of small, behavior-preserving, diff-scoped-gated slices.

- **Scope:** $ARGUMENTS (default: the whole repo)
- **Baseline:** !`npx --no-install keel eval 2>&1 | tail -5 || echo "run: pnpm exec keel eval"`

First read `.claude/skills/refactor/SKILL.md`, `.claude/skills/code-craft/SKILL.md`, and `.claude/skills/testing/SKILL.md`. This command is the campaign orchestrator; each slice runs the normal lifecycle (`/keel:build` → `/keel:verify` → `/keel:review` → `/keel:ship`).

## Do

1. **Baseline the starting point.** Confirm the suite is green and the app builds/runs. Run `keel eval` (and `keel report` for the table) to record what the diff-scoped gate already flags. You can't prove a refactor preserved behavior from an unknown baseline.
2. **Spec the target.** This is a Define pass for the refactor itself: write a spec (`/keel:spec`) for the **target standard** — the bar every module must reach (size limits, pure core / I-O at the edges, honest types, patch coverage ≥ the bar, a spec behind each subsystem), the **invariants that must be preserved** (behavior parity), and what's explicitly **out of scope**. Commit it before touching code.
3. **Characterize before you change — record the net, don't hand-write it.** For any area without tests, pin its *current* behavior **first**; for a web/full-stack app the cheap net is a **recorded golden master**, not hand-authored assertions. keel bundles no recorder — use the detected driver: **Playwright** (`codegen` for flows, `--save-har` for every call+response, `toHaveScreenshot()` for the UI), or **Keploy** when the backend is DB-heavy or non-JS (it records DB interactions too), or gstack `/browse` to eyeball. **Freeze that baseline** (commit it) before touching code, then per slice **replay the new run and diff it against the frozen baseline** — normalize volatile fields (timestamps, IDs), mask dynamic UI regions, set a screenshot tolerance (not pixel-zero). Two hard rules: a refactor PR **never regenerates the baseline** (re-recording from the changed code makes the oracle reflect the new code and proves nothing), and you only guard the scenarios you recorded — record the critical paths + the slice's blast radius and state what's left unguarded. (Diffy-style live diff-proxies compare two *running* versions — that's canary, not record-then-refactor.) A refactor never starts on untested code.
4. **Inventory & prioritize.** Map the modules; rank by risk × churn × blast-radius. Find the **deepening opportunities** with the deletion test (would removing this module concentrate complexity, or just move it?). Order as vertical, seam-first slices — each a task contract (`/keel:plan`) traceable to a target-spec Done line, each under `prSize.fail`.
5. **Refactor slice by slice through the lifecycle.** For each slice: Build (behavior-preserving, tests green throughout) → Verify (tiers + patch coverage) → Review → Ship. **One intent per PR — refactor or feature, never both.** Each PR is small and `keel eval`-gated, so the bar lands on exactly what you touched.
6. **Ratchet up.** As a subsystem reaches standard, tighten its thresholds in `keel.config.json` and enable the opt-in gates (`spec-gate`, `spec-quality`) for it, so the cleaned area can't regress. Never lower a threshold to pass a messy slice — clean the slice.

## Done when

The target spec's **Done** is met across the inventory, every slice shipped behavior-preserving and green, and the ratcheted thresholds hold `keel eval` green — the grandfathered set has shrunk to zero by intent. Report what was refactored, what was deliberately left, and the before/after baseline.
