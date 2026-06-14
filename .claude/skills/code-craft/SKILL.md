---
name: code-craft
description: The code-quality bar the gate enforces — no magic values, pure logic with I/O at the edges, immutability, structured logging, explicit errors, size limits. Use while writing or refactoring any code.
---

# code-craft

The disciplines that keep code readable, testable, and safe. The gate enforces the mechanical ones (lint ratchet, size limits); this skill is why they exist and the ones lint can't catch.

## Process

1. **No magic values.** Every literal string/number/enum is a named `const`, an enum, or a config value. A bare `7` or `"PENDING"` in logic is a defect.
2. **Pure logic, I/O at the edges.** Business rules are pure functions of their inputs. All I/O (DB, network, fs, clock, randomness) lives in injected dependencies — never reached for inside a pure function. This is what makes logic testable without mocks-of-mocks.
3. **Immutability.** Never mutate a function argument or shared state. Take inputs as `readonly`; return new values. Mutation-at-a-distance is the bug you debug for a day.
4. **Structured logging.** Log via the project's structured logger with an `event` field — never `console.*`. A log line is a queryable event, not a print statement.
5. **Explicit errors.** No empty `catch`, no floating promises, no swallowed rejections. Model the failure; handle it or propagate it with context.
6. **Honest types.** No `any`, no `as` to silence the compiler, no `@ts-ignore`. Parse untrusted input at the boundary and infer the type; discriminated unions for state.
7. **Size limits.** Respect `limits.fileLines` / `functionLines` / `componentLines`. Over the limit → extract, don't cram.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "It's obvious what `* 86400` means." | Until it's `* 86400000` three lines down. Name it `SECONDS_PER_DAY`. |
| "Injecting the clock/db is over-engineering." | It's the difference between a unit test and an integration test you can't run offline. |
| "`as any` just to ship." | You've moved a compile-time error to a runtime one in production. Model the shape. |
| "The function is long but cohesive." | Cohesive functions over the limit still hide branches. Extract the named steps. |

## Red flags

- A literal in a conditional or calculation.
- A pure-looking function that reaches for `Date.now()`, `fetch`, or a module-level client.
- `let` + reassignment where a derived `const` would do; mutating a passed-in array/object.
- `catch {}`, an unawaited promise, `any`/`as`/`@ts-ignore`.

## Verification

- `keel lint` is clean on the diff (the ratchet blocks new warnings).
- No literal magic values introduced; no `console.*`; no `any`/`as`/`@ts-ignore`.
- New logic is unit-testable without touching real I/O.
