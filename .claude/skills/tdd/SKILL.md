---
name: tdd
description: Red-green-refactor — write the failing test first, the minimum code to pass, then refactor green. Use when implementing any new logic.
---

# tdd

The test comes first because the test *is* the spec's acceptance criterion. keel's TDD check fails any new logic file with no matching test — so this discipline is enforced, not optional.

## Process

1. **Red.** Write one failing test for the next acceptance criterion. Run it; watch it fail for the right reason (asserting real behavior, not a typo).
2. **Green.** Write the *minimum* code to pass — no speculative generality.
3. **Refactor.** With the test green, improve the design to the code-craft bar. The test is your safety net.
4. **Repeat** one criterion at a time. Each cycle is a vertical slice.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "I'll write the code, then the test." | Test-after tests what you built, not what you meant — and it never fails first, so you don't know it works. |
| "The design is obvious, skip red." | A test you never saw fail might be asserting nothing. Watch it go red once. |
| "TDD slows me down." | It front-loads the thinking you'd otherwise do in the debugger. Net faster on anything non-trivial. |

## Red flags

- A new logic file with no sibling test (the gate blocks it).
- A test that passed the first time it ran (did it ever exercise the new code?).
- Writing five tests then five implementations (you've lost the loop).

## Verification

- `keel tdd` passes.
- Each test was observed to fail before its code existed.
- Tests map 1:1 to the spec's "Done" criteria.
