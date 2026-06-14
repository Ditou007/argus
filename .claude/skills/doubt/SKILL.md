---
name: doubt
description: Adversarial self-check — before claiming done, try to break your own work and assume the confident belief is the wrong one. Use before declaring a task complete or a bug fixed.
---

# doubt

Confidence is not evidence. The belief you hold most strongly ("this obviously works") is the one least tested. Before claiming done, become your own adversary.

## Process

1. **State what you believe is true** ("the fix works", "this handles all cases") — then attack that exact claim.
2. **Hunt the counterexample.** What input breaks it? The empty case, the huge case, the concurrent case, the malformed case, the boundary?
3. **Distrust the thing you didn't test.** "It should work" is a hypothesis. Run it, don't assert it.
4. **Re-read the requirement**, not your memory of it. Did you solve the asked problem or an adjacent one?
5. **Assume the bug is in your change** first, not in the framework/library/compiler — that's true the overwhelming majority of the time.
6. **Surface your uncertainty** instead of hiding it: say what you didn't verify.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "It obviously works." | "Obviously" is the flag. Obvious things are cheap to verify — so verify, don't assert. |
| "Must be a bug in the library." | It almost never is. Exhaust your own code before blaming the dependency. |
| "I tested the happy path, good enough." | The happy path is the one that was never going to break. Test the edges. |

## Red flags

- "Done" with no run/test that exercised the change.
- Blaming the framework before auditing your diff.
- A claim of completeness covering only the case you had in mind.

## Verification

- The central claim was attacked with concrete adversarial cases.
- The change was actually run/tested, not asserted to work.
- Remaining uncertainty is stated, not hidden.
