---
name: code-review
description: Five-axis diff review — correctness, design, readability, tests, security — with file:line evidence and concrete suggestions. The everyday peer review beneath the ship-check gate. Use when reviewing a PR or your own diff before opening one.
---

# code-review

The routine review that catches issues before the formal `ship-check` gate. Lighter than the merge gate, but still evidence-based — a review without `file:line` is an opinion.

## Process

Read the whole diff once for intent, then pass over five axes:

1. **Correctness** — does it do what the change claims? Off-by-ones, edge cases, error paths, the empty/null case.
2. **Design** — right abstraction, right layer (pure core / I/O at edges), no needless coupling, no duplication of something that exists.
3. **Readability** — names say what they mean; the next reader understands it without you. Comments explain *why*, not *what*.
4. **Tests** — do they exist, assert behavior (not internals), and cover the new branches? Would they fail if the code regressed?
5. **Security** — untrusted input validated, authz server-side, no secret/PII in code or logs.

Every finding: `file:line` + what's wrong + a concrete fix. Distinguish **must-fix** from **nit** (and label nits as nits).

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "LGTM, looks fine." | "Looks fine" is not a review. Name what you checked on each axis or you checked nothing. |
| "I'll just approve, the author knows best." | The review is the second set of eyes the author can't be. Engage the diff. |
| "Too many nits is rude." | Unmarked nits mixed with must-fixes is what's rude. Separate and label them. |

## Red flags

- An approval with no comments on a non-trivial diff.
- A finding with no location or no suggested fix.
- Nits and blockers in one undifferentiated list.

## Verification

- Each of the five axes was considered.
- Every finding has `file:line` + a concrete fix; nits are labeled.
- Must-fix items are distinguished from preferences.
