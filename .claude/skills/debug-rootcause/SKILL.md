---
name: debug-rootcause
description: Iron law — no fix without a root cause. Investigate, reproduce, hypothesize, then fix the cause (not the symptom) with a regression test. Use when anything is broken or behaving unexpectedly.
---

# debug-rootcause

The iron law: **no fix without a root cause.** A patch that makes the symptom disappear without explaining *why* it occurred is a future regression wearing a disguise.

## Process

1. **Reproduce** deterministically. If you can't reproduce it, you can't know you fixed it.
2. **Investigate** — read the actual error/stack/log, not your assumption of it. Trace the value back to where it went wrong.
3. **Hypothesize** a single root cause and state how you'll confirm it.
4. **Confirm** — prove the hypothesis (a log, a test, a bisect) before changing code.
5. **Fix the cause**, then add a **regression test** that fails without the fix.
6. Defer to the project's live-debugging tooling (e.g. gstack `/investigate`) for runtime investigation — don't reimplement it.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "Adding a null-check makes it go away." | A null you didn't expect means a contract is violated upstream. Find why it's null. |
| "It works now, ship it." | "Works now" without "because X" means it'll break again under a slightly different input. |
| "No time to reproduce." | The time you save skipping repro you pay back with interest when it recurs in prod. |

## Red flags

- A fix you can't explain in one sentence ("it's a race… probably").
- try/catch added around the symptom with no understanding of the throw.
- No regression test accompanying the fix.

## Verification

- The root cause is stated in one sentence.
- A regression test fails without the fix and passes with it.
- The reproduction no longer reproduces.
