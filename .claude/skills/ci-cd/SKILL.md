---
name: ci-cd
description: Shape the pipeline so it's fast, authoritative, and honest — affected-only on PRs, the gate defined outside the repo under review, heavy checks post-merge, auto-revert on a broken main. Use when designing or changing CI/CD.
---

# ci-cd

CI is the gate that makes the rules real. A good pipeline is fast (so it's not bypassed), authoritative (a repo can't weaken its own gate), and honest (green means shippable).

## Process

1. **Run only what's affected** on a PR — the dependency graph sets scope. A package change runs it and its dependents; an app-only change runs just that app. Speed keeps the gate respected.
2. **The gate is authoritative and external.** The merge gate (`keel eval` / its reusable workflow) is referenced by pinned ref so the repo under review can't edit its own gate. Pin third-party actions by SHA.
3. **Tier the checks.** Fast deterministic checks gate every PR; slow full-stack e2e runs **post-merge** (too slow to gate each PR). Don't make every PR wait on the 20-minute job.
4. **Keep main shippable.** On a post-merge failure, auto-revert the offending merge and open a regression issue — main stays green by construction.
5. **Green means green.** No "allowed failures", no soft-fail on the check that matters. If it's advisory, label it advisory; if it gates, it gates.
6. **Mirror CI locally** (`keel eval`) so failures surface before the push, not after a pipeline round-trip.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "Run the whole suite on every PR to be safe." | Slow gates get bypassed with --no-verify. Affected-only keeps it fast enough to trust. |
| "Let the repo define its own gate." | Then the repo can weaken it in the same PR. Pin the gate externally. |
| "The flaky job is allowed to fail." | An allowed-failure check is theater — it gates nothing. Fix it or remove it. |

## Red flags

- Every PR running the full, slow suite (or the e2e gating each PR).
- A gate workflow editable within the repo it gates; unpinned actions.
- `continue-on-error` on a check that's supposed to matter.

## Verification

- PRs run affected-only; the slow e2e is post-merge with auto-revert.
- The gate is pinned/external; third-party actions are SHA-pinned.
- No soft-failing check masquerades as a gate; `keel eval` mirrors CI locally.
