---
name: skill-eval
description: Evaluate whether a skill actually changes behavior — feed violating vs clean fixtures, check the verdict, and log what's NOT covered. Use when adding/revising a skill or before a model-family bump.
---

# skill-eval

A forward gap: most skill libraries ship prose with no proof it works. A skill that doesn't change the agent's verdict on a known-bad input is decoration. Evals are an offline confidence tool — never a CI merge gate (they're LLM-based: flaky, costly, model-sensitive).

## Process

1. **Two fixtures per claim** — a *violating* case the skill should catch and a *clean* case it must not false-positive on.
2. **Deterministic first.** Where a `keel` check backs the skill, the real check against the fixture is the reliable eval — no LLM, no flake. Prefer it.
3. **Behavioral second.** For judgment skills (ship-check, code-craft taste), feed the fixture to the agent, capture the verdict, grade against `expected.json`. Run offline only.
4. **Log what is NOT covered.** Crown-jewel policy cases that resist stack-neutral fixtures get listed explicitly. No silent "all green."
5. **Re-run on model-family bumps.** A skill tuned for one model may regress on the next; behavioral evals re-run before adopting a new model.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "The skill reads well, it must work." | Reading well ≠ changing the verdict on a bad input. Prove it with a fixture. |
| "Gate the merge on behavioral evals." | They're flaky and model-sensitive — gating on them blocks good PRs on noise. Offline only. |
| "Green scorecard, we're done." | A green you didn't earn (uncovered cases) is worse than a red. Log the gaps. |

## Red flags

- A skill with no violating fixture.
- Behavioral evals wired into a required CI check.
- A scorecard with no "not covered" section.

## Verification

- Each skill claim has a violating + clean fixture.
- Deterministic evals run the real check; behavioral ones run offline.
- The scorecard explicitly lists what it does not cover.
