---
name: domain-modeling
description: Make illegal states unrepresentable — model the domain with precise types (discriminated unions, value types, parsed-not-validated) so the compiler enforces the rules. Use when designing data shapes or a core domain.
---

# domain-modeling

The best validation is a type that can't hold a wrong value. Model the domain so illegal states are unrepresentable, and whole classes of bug become compile errors instead of runtime surprises.

## Process

1. **Parse, don't validate.** Turn untrusted input into a precise type at the boundary; downstream code receives the parsed type and never re-checks. A `string` that's been validated as an email should become an `Email`, not stay a `string`.
2. **Discriminated unions for state.** A thing that's "loading | error | loaded" is one union, not three optional fields where `loaded && error` is representable. Make the impossible combination not typecheck.
3. **Value types over primitives** for domain concepts — `UserId` not `string`, `Cents` not `number` — so you can't pass an order id where a user id goes.
4. **Required by default; optional is a decision.** Every optional field is a branch someone must handle. Make fields required unless absence is genuinely meaningful.
5. **Push invariants into constructors.** If a `Money` can't be negative, enforce it where it's built, not at every use site.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "A string is fine, we know it's an email." | "We know" is a comment, not a guarantee. The type that proves it can't be misused. |
| "Optional fields are flexible." | Flexible = every reader handles `undefined`, and forgets once. Required-by-default removes the branch. |
| "Discriminated unions are overkill." | The bug where `isLoading && error && data` are all set is exactly what they make impossible. |

## Red flags

- Booleans/optionals that encode a state machine (`isLoading`, `hasError`, `data?`).
- Primitive obsession — `string`/`number` for ids, money, dates everywhere.
- Re-validating the same value at multiple layers.

## Verification

- Illegal combinations of state don't typecheck.
- Domain concepts have their own types; input is parsed to them at the boundary.
- Invariants are enforced at construction, not re-checked at use.
