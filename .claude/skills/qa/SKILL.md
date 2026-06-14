---
name: qa
description: Tool-agnostic QA discipline — what to test and how to prove it, independent of any tool. Tiered passes (critical path → edge → error/empty → responsive/a11y → regression), real evidence, fix-and-reverify. Use to QA a running feature when no dedicated QA tool is assumed.
---

# qa

The *discipline* of quality-assuring a running change — **independent of any tool**. It says **what to test and how to prove it**, so it works whether you drive the app with a full browser harness, a headless script, `curl`, or by hand. (For the live *engine*, see `verify-live`; this is the methodology it executes.)

## Process

Test in tiers, stopping to fix-and-reverify as you go — don't batch findings to the end:

0. **QA the artifact a user actually gets — not just the source.** For a published CLI/library/tool, install or adopt the *built* package into a throwaway dir and use it for real (`npm install` it, run the actual commands); for a web change, the deployed/running app. The bugs that pass every unit test — a missing packaged file, a broken first-run on a clean install — only show up here.
1. **Critical path first.** The one or two flows that, if broken, make the feature worthless. Exercise them end-to-end against a real running instance, not a mock.
2. **Edge cases.** Boundaries, large/empty inputs, the second-of-two, the unicode/long-string case, concurrency where it applies.
3. **Error & empty states.** What the user sees when the call fails, returns nothing, times out, or is unauthorized. These are the states most often shipped broken.
4. **Responsive & accessibility** (for UI) — small/large viewport, keyboard-only, focus order, labels/contrast.
5. **Regression** — the adjacent things this change could have broken (the blast radius from `zoom-out`).

For each finding: **capture evidence** (the exact steps, the actual vs expected, a screenshot/response/log), **root-cause it** (`debug-rootcause` — no fix without a cause), fix, and **re-verify the same step**. Then **leave an e2e test behind** — codify the flow (and the bug) so it can't silently come back; QA that leaves no test gets re-found cold next time.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "The happy path works, ship it." | The happy path is the one that was never going to break. The error/empty states are where the bugs are. |
| "I'll note all the bugs and fix them later." | A batch at the end means each is re-investigated cold. Fix-and-reverify as you find them. |
| "I can't QA without the fancy QA tool." | The tool is the *engine*; this is the *checklist*. keel bundles no browser — probe for the best driver present (gstack if installed, else the project's Playwright/Cypress, else curl/HTTP, else manual) and use it. gstack is optional, never required. |
| "It looked right." | "Looked right" isn't evidence. Capture the actual result against the expected one. |
| "Tests pass, so it's QA'd." | A green suite is a claim, not an observation. QA means running the real artifact and watching it — and leaving a *new* e2e behind. No ship-ready verdict rests on the old suite alone. |

## Red flags

- QA that only exercised the happy path.
- Findings listed but not root-caused or re-verified after the fix.
- A claim of "tested" with no captured evidence (steps, output, screenshot).
- Skipping QA entirely because no dedicated tool was installed.
- A "ship-ready" verdict with no new e2e left behind, or one resting on the existing suite rather than an observed run of the real artifact.

## Verification

- Each tier (critical → edge → error/empty → responsive/a11y → regression) was considered.
- Every finding has evidence, a root cause, a fix, and a re-verified result.
- The feature was exercised against a real running instance (and, for a published artifact, a fresh install/adopt) — not assumptions.
- Every confirmed flow left an e2e test behind, so it's regression-proof.
