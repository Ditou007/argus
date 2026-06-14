---
name: refactor
description: Refactor an existing/legacy codebase up to standard as a planned campaign of behavior-preserving, gated slices — never a big-bang rewrite. Pin behavior with characterization tests first, deepen shallow modules, raise the bar slice by slice. Use when the goal is to modernize or clean up a whole repo, not add a feature.
---

# refactor

Adoption (the default) raises the floor on *new* code and grandfathers the old. A **refactor campaign** is the opposite intent: you've decided to bring the legacy itself up to standard. The trap is the big-bang rewrite — a branch that diverges for weeks, throws away the bug-fixes the old code encodes, and lands as one unreviewable diff. The discipline is the opposite: **many small, behavior-preserving, gated slices**, so the floor rises file by file and `keel eval` holds each diff to the full bar as you touch it. The architecture lens (deepening, the deletion test) is adapted from Matt Pocock's `improve-codebase-architecture`.

## Process

1. **Behavior-preserving, always — net first, and *record* the net.** A refactor changes structure, never behavior. Before you touch untested code, pin its *current* behavior **first** — and for a web/full-stack app the cheap net is a **recorded golden master**, not hand-authored assertions. Capture flows + every call/response + screenshots with the detected driver (Playwright `--save-har` + `toHaveScreenshot`, or Keploy for DB-heavy/non-JS backends; keel bundles no recorder), **freeze it**, and replay-diff each slice against that frozen baseline (normalize volatile fields, mask dynamic UI, screenshot tolerance — not pixel-zero). The baseline is the oracle: a refactor PR never regenerates it, and it only guards the scenarios you recorded. If you can't put a net around it, you can't safely refactor it — write the net before you cut.
2. **One intent per diff: refactor *or* feature, never both.** If a refactor and a behavior change share a PR, a failing test can't tell you which one broke it. Spec behavior changes separately. A refactor PR's tests are green before and after, unchanged in intent.
3. **Deepen, don't reshuffle.** Target **shallow** modules — interface nearly as complex as the implementation. Apply the **deletion test**: if you deleted this module, would complexity *concentrate* (it earns its keep) or just *move to the callers* (it's a pass-through to inline)? Extract for **leverage and locality**, not to scatter logic into tiny pure functions whose real bugs hide at the call site.
4. **Vertical slices, seam-first.** Refactor one seam at a time, each independently shippable and under `prSize.fail`. For risky swaps use the strangler pattern: stand up the new path behind a seam, migrate callers, then delete the old one (→ `deprecation-migration`). Never leave two live paths doing the same thing.
5. **Hold each slice to the bar.** Every slice runs the normal lifecycle (Build → Verify → Review → Ship); `keel eval` is diff-scoped, so the file you refactor is held to `code-craft` standards (size, pure core/I-O edges, types, no magic values) without dumping the rest of the repo on you.
6. **Ratchet, don't relax.** As a subsystem reaches standard, *tighten* its thresholds and enable the opt-in gates (`spec-gate`, `spec-quality`) for it so the cleaned area can't regress. The grandfathered set shrinks to zero by intent, not by lowering the bar.
7. **Know when to stop.** Refactor to remove real friction — untestability, tangled seams, lost locality — not to chase aesthetic purity. A module that's plain inside but has a small, honest interface is already deep enough.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "It's faster to rewrite it from scratch." | A rewrite discards the behavior the old code encodes — including every bug fix. Refactor in place behind characterization tests; only rewrite with a spec and parity tests. |
| "I'll refactor and add the feature in one go." | Then no test can bisect the regression. Land the behavior-preserving refactor first, the feature second. |
| "It's too tangled to test — I'll just be careful." | "Careful" is how silent regressions ship. Pin current behavior with a characterization test first, even an ugly one. |
| "It's too tangled to hand-write tests for." | Then don't hand-write them — *record* a golden master (Playwright `--save-har` + screenshots, or Keploy). Capturing current behavior is cheap; you don't have to know the expected output, you freeze it. |
| "I'll re-record the baseline after refactoring and compare." | Then the oracle is the changed code — it can't catch a regression. Record the *old* behavior once, freeze it, and replay the new code against it. |
| "Extract everything into small pure functions." | Shallow extraction moves the bug to the call site (no locality). Deepen: real leverage behind a small interface. |
| "We'll clean the whole thing in one big PR." | Unreviewable, unbisectable, and it blocks everyone. Slice it; each slice ships green. |

## Red flags

- A refactor PR that also changes behavior (nothing can bisect a regression).
- Refactoring untested code with no characterization test added first.
- The characterization baseline regenerated by the refactor PR itself — the oracle now reflects the new code, not the old, so it can't catch a regression.
- A wave of tiny pass-through modules presented as "cleaner" (shallow, fails the deletion test).
- A big-bang rewrite branch diverged from main for weeks.
- Thresholds *lowered* to make a messy slice pass, instead of the slice cleaned.

## Verification

- Behavior is provably preserved: existing/characterization tests are green before **and** after, and the diff changes no behavior.
- Each slice is its own small PR, `keel eval` green, under the PR-size budget.
- Cleaned subsystems have ratcheted thresholds / opt-in gates enabled so they can't regress.
- Net complexity dropped: what you kept passes the deletion test; what you removed left no orphaned tests, docs, or flags.
