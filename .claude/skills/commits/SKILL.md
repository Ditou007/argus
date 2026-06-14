---
name: commits
description: Conventional Commits — type(scope): subject, lower-case, no trailing period, header within the configured limit, one logical change per commit. Use when committing any change.
---

# commits

A commit message is a permanent, queryable record — the basis for the changelog, the blame, and the next person's understanding. Conventional Commits make it machine-parseable and consistent.

## Process

1. **Format `type(scope): subject`.** Subject lower-case, imperative mood, **no trailing period**, header within `commits.headerMaxLength` (config).
2. **`type`** ∈ `commits.types` — `feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore` / `perf` / `ci` / `build` / `revert`.
3. **`scope`** (optional) from `commits.scopes` when the project defines them — the workspace/area touched.
4. **One logical change per commit.** If the subject needs "and", it's two commits.
5. **Body (when needed):** *why*, not *what* — the diff shows what. Wrap at ~72. Reference the spec/issue.
6. **Breaking change:** a `!` after the type/scope (`feat(api)!:`) and a `BREAKING CHANGE:` footer — and a `major` changeset.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "`fix: stuff`" | Useless in six months. Name the actual fix. The message is for the reader, not the act of committing. |
| "I'll squash a dozen WIP commits later." | "Later" you've lost the boundaries. Commit one logical change at a time. |
| "Scope is bureaucracy." | Scope is what makes `git log --grep` and the changelog navigable. Use the project's. |

## Red flags

- A header over the limit, capitalized, or ending in a period.
- A commit doing two unrelated things.
- A `feat`/`fix` to a published package with no changeset.

## Verification

- Header matches `type(scope): subject`, lower-case, no period, within `commits.headerMaxLength`.
- `type` is in `commits.types`; scope (if any) in `commits.scopes`.
- One logical change; breaking changes flagged with `!` + a `major` changeset.
