---
name: keel-update
description: Upgrade an adopted keel safely — three ownership tiers, upstream re-copied, project-owned never touched. Use when bumping keel's version in a repo that already adopted it.
---

# keel-update

Users tune keel to their repo, so the update path must never clobber that tuning. Three ownership tiers decide what gets overwritten and what is sacred.

## Process

1. **Know the three tiers:**
   - **Upstream-owned** (`.claude/skills`, `.claude/agents`, `.claude/commands`) — **overwritten** with the installed version on update.
   - **Project-owned** (`keel.config.json`, your filled BRD/PRD/TRD/SPECs/ADRs, ejected configs) — **never touched**.
   - **Local overlay** (`.claude/skills/local/**`) — **never touched**.
2. **Run `keel init --update`** — re-copies the upstream tier, refreshes the managed `## keel` CLAUDE.md block, bumps the `.keel` marker. The `local/` overlay is skipped by construction.
3. **Diff and verify the tiers held** — only upstream files + the managed block + `.keel` should change. A changed project-owned file means stop and investigate.
4. **Read the CHANGELOG** for the version delta; apply any flagged config/schema migration to `keel.config.json` by hand.
5. **Re-run `keel eval`** — a newer version may tighten a check; fix the code, don't pin back.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "I'll just edit the skill file to my taste." | Then the next update clobbers it. Customize via config or `skills/local/`, never the upstream file. |
| "Pin to the old version so the new check doesn't fire." | The new check found a real gap. Fix it; pinning back is hiding it. |
| "Skip the changelog, just bump." | A breaking schema change applied silently corrupts your config. Read the delta. |

## Red flags

- Edits made directly to upstream skill/command files (lost on next update).
- A project-owned file changed by an update.
- Pinning keel back to dodge a newly-failing check.

## Verification

- After update, only upstream files + the managed CLAUDE.md block + `.keel` changed.
- `keel.config.json` and `skills/local/**` are untouched.
- `keel eval` is green on the new version; any migration from the changelog applied.
