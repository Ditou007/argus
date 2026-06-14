---
name: ship-check
description: The senior-architect merge gate — run the deterministic floor, then review the diff across all dimensions with file:line evidence and project invariants, ending in BLOCK / CHANGES_REQUESTED / APPROVE. Use before merging anything.
---

# ship-check

The consolidated review gate. The deterministic checks are the floor; this is the judgment layer above them. It is adversarial by design and refuses to rationalize.

## Process

1. **Floor first.** Run `keel eval`. Red → verdict is **BLOCK**, full stop. Never review *around* a failing gate.
2. **Review every dimension**, each finding carrying `file:line` evidence:
   - **Correctness** — does it do what the spec's "Done" says? Edge cases, error paths.
   - **Architecture** — pure core / I/O at edges / DI; boundaries respected.
   - **Code-craft** — the rules lint can't see (naming, cohesion, the right abstraction).
   - **Performance** — measure-first; no unbounded loops/queries, no N+1, pools created once.
   - **Security** — input validation, authz, secret handling, egress, OWASP.
   - **Tests** — assert behavior not internals; cover the new branches; three tiers as warranted.
   - **Docs honesty** — does the prose still match what shipped?
3. **Project invariants.** Check each rule in `review.projectInvariants` adversarially — *can* the change subvert it?
4. **Severity-tag** every finding (critical / major / minor).
5. **Verdict:** `BLOCK` (gate red or a critical) · `CHANGES_REQUESTED` (must-fix, non-critical) · `APPROVE` (clean). State it with the findings that justify it.

## Rationalizations (the anti-rationalization core)

| Excuse | Rebuttal |
| --- | --- |
| "It's a small change, skip the full review." | Small diffs cause big outages. The size of the diff is not the size of the risk. |
| "The test is flaky, not my code." | Then the finding is 'flaky test' — file it. 'Probably fine' is not a verdict. |
| "We'll fix it in a follow-up." | Follow-ups are where defects retire. If it's must-fix, it's CHANGES_REQUESTED now. |
| "The author is senior, trust it." | The gate is impersonal on purpose. Evidence, not authorship, decides. |

## Red flags

- Wanting to APPROVE with the gate red.
- A finding without `file:line` (it's a vibe, not a finding).
- Softening a verdict because of deadline pressure.

## Verification

- `keel eval` is green before any APPROVE.
- Every finding cites `file:line`; every must-fix is reflected in the verdict.
- Project invariants explicitly checked, not assumed.
