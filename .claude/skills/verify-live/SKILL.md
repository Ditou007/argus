---
name: verify-live
description: Drive the running app to verify behavior — prefer a dedicated live-QA engine (e.g. gstack /qa, /browse) IF present, else fall back to whatever runtime/browser tooling is available. Never assume a specific tool exists. Use for live/exploratory verification of a user-facing change.
---

# verify-live

The live counterpart to `testing`: exercise the **running** app, not just the test suite. keel does not ship a browser engine — so this skill is about **picking the best available driver and degrading gracefully**, then executing the `qa` discipline through it. It must work in a repo with no extra tooling installed.

## Process — pick the driver, then run the `qa` checklist through it

1. **Prefer a dedicated live-QA tool IF it's available.** If gstack is installed, use `/qa` (test-and-fix) or `/browse` (drive/screenshot) — it's purpose-built and keel does not reimplement it (see `PRECEDENCE.md`). **Check first; never assume it's there.**
2. **Else fall back, in order, to whatever the repo has:**
   - a built-in browser/automation tool available to the agent;
   - the project's own e2e runner (Playwright/Cypress) in headed/UI mode;
   - a headless script / `curl` / HTTP client for API and server flows;
   - **as a last resort, scripted manual steps** the human runs, with expected results.
3. **Run the app for real** — start the dev server / boot the service / point at a running instance. Verifying against a non-running app is not verifying.
4. **Execute the `qa` discipline** through the chosen driver (critical path → edge → error/empty → responsive/a11y → regression), capturing evidence per finding.
5. **Root-cause and fix** (`debug-rootcause`), then re-verify the same flow through the same driver.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "gstack isn't installed, so I can't do live QA." | gstack is the *preferred* engine, not the *only* one. Fall back to e2e/curl/manual — the discipline doesn't depend on one tool. |
| "Unit tests pass, live QA is redundant." | Unit tests can't catch the wiring, the real network, the actual rendered state. Drive the running app. |
| "I'll assume gstack is there." | Assuming a sibling tool breaks in any repo without it. Detect, then choose. |

## Red flags

- Skipping live verification because one specific tool is absent.
- "Verified" against an app that wasn't actually running.
- Reimplementing a browser harness keel already defers to gstack for (when gstack *is* present).

## Verification

- The best *available* driver was chosen (gstack if present, else a graceful fallback) — not assumed.
- The app was exercised live, and the `qa` checklist was run through that driver with evidence.
- Findings were root-caused, fixed, and re-verified.
