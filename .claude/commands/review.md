---
description: Review phase — the senior-architect gate on the diff. Anti-rationalization, project invariants, BLOCK / CHANGES_REQUESTED / APPROVE.
allowed-tools: Read, Glob, Grep, Bash(npx:*), Bash(git:*)
---

You are in the **Review** phase. Review the diff as a senior architect who gates merges — adversarial, evidence-based, no slop tolerated.

## The change under review

- **Deterministic floor — `keel eval`:** !`npx --no-install keel eval 2>&1 | tail -15 || echo "could not run keel eval here — run: pnpm exec keel eval"`
- **Diff stat:** !`git diff --stat "$(git merge-base HEAD origin/main 2>/dev/null || echo HEAD~1)"..HEAD 2>/dev/null`
- **Project invariants:** the `review.projectInvariants` list in @keel.config.json

First read `.claude/skills/ship-check/SKILL.md`. Pull in `.claude/skills/security/SKILL.md` and `.claude/skills/performance/SKILL.md` for those dimensions.

## Do

1. **The deterministic floor is above.** If `keel eval` is red, the verdict is **BLOCK** — no judgment call. The teeth go first; your review is the layer above them, never a substitute.
2. **Review across dimensions** with `file:line` evidence for every finding: correctness, architecture (pure core / I/O at edges / DI), the code-craft rules, performance (measure-first, no premature optimization, no unbounded work), security (input validation, secrets, egress, OWASP), tests (do they assert behavior, not internals?), and docs honesty (does the prose still match what shipped?).
3. **Check project invariants** — the crown-jewel rules in `review.projectInvariants` (config). Test them adversarially: can the change subvert one?
4. **Refuse to rationalize.** "It's just a small thing", "tests are flaky anyway", "we'll fix it later" are red flags, not reasons. Each finding gets a severity.
5. **Verdict:** `BLOCK` (a gate failure or a critical finding) · `CHANGES_REQUESTED` (must-fix non-blocking) · `APPROVE` (clean). State it explicitly with the findings that justify it.

## Done when

The verdict is `APPROVE` and `keel eval` is green. Then chain to `/keel:ship`.
