---
description: Update keel in this repo — re-copy the upstream-owned skills/agents/commands and refresh the managed CLAUDE.md block, without touching your config or local overlay.
allowed-tools: Read, Edit, Bash(npx:*), Bash(git:*)
---

You are updating this repo's adopted keel to the installed version. Follow the `keel-update` skill.

- **Installed keel version:** !`npx --no-install keel --version 2>/dev/null || cat node_modules/@wednesday-sol/keel/VERSION 2>/dev/null || echo "(resolve via pnpm exec keel)"`

## Do

1. **Run the update:** `keel init --update`. This re-copies the upstream-owned tier (`.claude/skills`, `.claude/agents`, `.claude/commands`) and refreshes the managed `## keel` block in `CLAUDE.md`.
2. **What it never touches** (project-owned): `keel.config.json`, your filled docs/specs/ADRs, and `.claude/skills/local/**`. Confirm those are unchanged.
3. **Review the diff.** The only changes should be upstream skill/command/agent files + the managed CLAUDE.md block + the `.keel` marker. If a project-owned file changed, stop — something is wrong.
4. **Re-run the gate:** `keel eval`. A new keel version may add or tighten a check; fix what it flags (don't pin to the old version to avoid the work).
5. **Note version-specific migration** if `CHANGELOG.md` flags a breaking config/schema change — apply it to `keel.config.json` by hand.

## Done when

The upstream tier is current, project-owned files are untouched, and `keel eval` is green on the new version.
