---
name: testing
description: The three-tier test discipline (unit · cross-cutting e2e · browser e2e) and patch-coverage doctrine the gate enforces. Use when adding or reviewing tests for any change.
---

# testing

Tests are the executable form of the spec's "Done." A feature isn't done until the tiers it warrants exist and the patch is covered.

## Process

1. **Three tiers, by purpose:**
   - **Unit** (colocated, the bulk) — pure logic, every branch. Fast, no real I/O (that's what DI is for).
   - **Cross-cutting e2e** (root `tests/` workspace) — real-HTTP / integration / contract / air-gap. The seams between units.
   - **Browser e2e** (`e2e/` workspace) — Playwright over the built app, for user-facing flows only.
2. **Test behavior, not internals.** Assert on observable outputs and effects, not private fields or call counts. A refactor that keeps behavior must keep tests green.
3. **Patch coverage, not vanity coverage.** `keel coverage` checks the lines THIS diff added against `coverage.min` — across lines, statements, functions, AND branches. Cover the new error path, not just the happy line.
4. **Mock the network at the boundary** (e.g. MSW), never the module under test.
5. **One reason to fail per test.** A test that asserts ten things tells you nothing when it goes red.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "Coverage is already 95% overall." | Overall coverage hides uncovered new code. Patch coverage is what protects this change. |
| "It's hard to test, so I'll skip it." | Hard-to-test is a design smell — the I/O isn't at the edge. Fix the seam, then test. |
| "E2E is slow, unit is enough." | Unit can't catch the wiring between units. The tier exists because that's where integration bugs live. |
| "I'll mock the function I'm testing." | Then you're testing the mock. Mock the boundary, exercise the unit. |

## Red flags

- A new branch/error path with no test.
- Tests asserting on internals (will break on any refactor).
- A feature shipped with only one tier when it spans seams or UI.

## Verification

- `keel coverage` meets `coverage.min` on all four metrics for the diff.
- `keel tdd` passes (every new logic file has a test).
- Tests assert behavior and fail for exactly one reason.
