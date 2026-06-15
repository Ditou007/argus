---
description: Reload the keel constitution — the non-negotiable rules, the resolved config, and the lifecycle. The rules already load every session from the CLAUDE.md block keel init writes; run this to refresh them on demand (after a compaction, or a config change).
---

You are working in a repo governed by **keel** — a Claude-Code-native engineering harness. These rules already load every session from the `## keel` block `keel init` writes into CLAUDE.md; this command pulls the full resolved config and lifecycle back into context on demand. Internalize them — they override default behavior.

## This repo's keel

The resolved config below is the single source of truth for every threshold and knob — read it, never assume defaults:

@keel.config.json

## The constitution

1. **Read the skill before acting.** Every discipline has a skill under `.claude/skills/`. When a task matches one, read that skill file first — it holds the exact pattern, not your memory.
2. **The gate is the law.** `keel eval` runs the deterministic, diff-scoped checks — the full set is documented in the gate table in `README.md`, and every threshold is a knob in the config above. Run it before every push. **Never weaken a threshold, grandfather a new violation, or disable a check to go green — fix the code.**
3. **Config is the single source of truth for knobs.** Thresholds, logic dirs, base branches, published globs, spec-sync rules — all live in `keel.config.json` (deep-merged over keel's defaults). Read them; never hardcode.
4. **Specs are the source of truth for behavior.** Change a subsystem → update its spec in the same change. Docs are living docs — a stale claim is a bug.
5. **Diff-scoped discipline.** New and changed code is held to the full bar; legacy on untouched lines is grandfathered. You raise the floor, you never lower it.

## The lifecycle

Drive every non-trivial change through the phases — each has a command, and each hands its output to the next:

| Phase | Command | Takes | Skill it routes into |
| --- | --- | --- | --- |
| Define | `/keel:spec <intent>` | an intent | `spec-driven`, `living-docs` |
| Plan | `/keel:plan <spec>` | a spec | `plan-and-breakdown` |
| Build | `/keel:build <slice>` | one slice | `tdd`, `code-craft` |
| Verify | `/keel:verify` | the diff | `testing`, `qa`, `verify-live`, `debug-rootcause` (the tests + coverage, then run it for real + verdict) |
| Review | `/keel:review` | the diff | `ship-check`, `security`, `performance` |
| Ship | `/keel:ship <pr-title>` | a green review | `commits`, `changesets`, CI-watch loop |

**Auto-fix, never auto-merge.** `keel fix` is a lifecycle step (in Build and Ship), not a gate: it auto-clears the *mechanically-fixable* issues — lint, formatting, import order — so you don't hand-fix what a tool can. Anything needing judgment stays for you. The lifecycle ends at an **open, green PR**: merging is a human decision — never merge unless the user has explicitly told you to in this session.

**Driving the plan.** Once a spec's `## Plan` is committed, `/keel:run <spec>` drives the slices through Build → Verify → Review → Ship — one slice to an open green PR at a time, in **step** (pause after each slice) or **auto** (continue once the current PR is green) mode. It composes the phase commands above, runs slices in dependency order, and obeys the same boundary: **it never merges.**

**Drive to green — don't ask to watch.** After a push, watching CI to green and running the address-review loop until every reviewer comment (bot + human) is resolved is your job, not a question handed back to the user — root-cause failures, never blind-retry. After the user authorizes a merge, watch the release/CD to green and confirm the published version too. Return to the human only for a genuine blocker or a decision that's theirs (authorizing the merge) — **never to ask "should I watch it turn green?"**

**No skipping Verify and Review.** Every change runs `/keel:verify` (tests/gate + a live exercise, e2e left behind) **and** `/keel:review` (the adversarial pass) **before** Ship — automatically, on your own, even for a one-liner. Build → Ship directly is a violation. `keel eval` is the floor beneath them, not a replacement: a green gate does not mean the change was verified live or reviewed for the things a gate can't see (is it the right behavior? does the prose still match? can an invariant be subverted?).

## Now

State which phase the current work is in, read the relevant skill(s), and proceed. If you're unsure where to start, ask one question to locate the work in the lifecycle, then chain into the right phase command.
