---
name: changesets
description: Record every releasable change as it lands — one changeset per meaningful change to a published package, in the same PR. The drift ledger and the basis for SemVer. Use when changing anything under a published path.
---

# changesets

`.changeset/` is the running answer to "what changed since the last release." Every meaningful change to a published package adds one descriptive entry **in the same PR** — so the changelog writes itself and versioning is honest.

## Process

1. **One changeset per change**, kebab-slug filename (often spec-tagged), added in the same PR as the code.
2. **Pick the bump by impact:** `patch` (fix, no API change) · `minor` (additive, backward-compatible) · `major` (breaking — include a migration note).
3. **Write it for a human reading the changelog:** what changed and why it matters, per package. Not "misc fixes."
4. **Scope to published packages.** A change confined to apps/internal-only code needs no changeset; `changesets.publishedGlobs` defines what's published.
5. **API path versioning** (if the project versions routes): a breaking contract change bumps the path, never mutates an existing one in place.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "I'll add the changeset at release time." | At release time nobody remembers the intent of each change. The ledger is only honest if written as it lands. |
| "It's a trivial change." | Trivial-but-released still changes a consumer's installed bytes. Record it (`patch`). |
| "Breaking, but consumers will figure it out." | A `major` without a migration note is a support ticket factory. Write the upgrade steps now. |

## Red flags

- A PR touching a published package with no `.changeset/*.md`.
- A bump that understates impact (a breaking change filed as `patch`).
- A changeset that says "updates" with no actionable content.

## Verification

- `keel changeset` is green for the diff.
- The bump level matches the actual API impact.
- A `major` carries a migration note.
