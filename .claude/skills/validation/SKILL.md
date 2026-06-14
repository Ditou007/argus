---
name: validation
description: Validate input on BOTH the frontend and the backend — never one or the other. Client validation is for UX; server validation is for trust and is non-negotiable. Unvalidated input is not shippable code. Use whenever a feature accepts user input across a client/server boundary.
---

# validation

Input crosses two boundaries — into the UI and into the server — and **both must validate, for different reasons**. Code that validates only one (or neither) is not good code, and it should not ship. This is the rule, not a preference.

- **Frontend validation = UX + fast feedback + defense in depth.** It tells the user what's wrong *before* a round-trip. It is **required**, but it is **not a security control** — anyone can bypass the client.
- **Backend validation = trust.** The server treats every request as hostile, because a request can come from a script, a replay, or a tampered client — not just your UI. It is **non-negotiable**: the security and data-integrity boundary lives here.

Skipping the server side because "the form already checks it" is the classic shipped vulnerability. Skipping the client side ships a frustrating product. Do both.

## Process

1. **Define the shape once, share it.** Put the validation schema (e.g. zod/valibot) in shared code so the client and server validate against the *same* rules — they can't drift. One source of truth for "what is valid."
2. **Backend: parse at the boundary, fail closed.** Every endpoint parses its input with the schema and rejects what doesn't conform with a clear error — before any logic runs. Never trust a field from the request body for a decision (id, role, amount) without validating it. (See `boundaries` / `security`.)
3. **Frontend: validate before submit AND on the response.** Inline field validation for UX; also handle the server's validation error (the server is the authority — surface its rejection, don't assume success).
4. **Validate the edges, not just the happy shape** — empty, too-long, wrong-type, out-of-range, injection-shaped. The error path is part of the feature.
5. **Never re-trust across layers.** Once the server has parsed input into a typed value, downstream code trusts it; it does not re-validate the same thing five layers deep (that's `domain-modeling`'s parse-don't-validate).

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "The frontend already validates it." | The frontend is a suggestion to a cooperative user. curl, a replay, or a tampered client ignores it. The server must validate or it's exploitable. |
| "It's an internal API, the server can trust the client." | An internal API is a public API with extra steps. Trust boundaries don't care that the caller is 'ours'. |
| "Server validation is enough, skip the client." | Then every mistake costs a round-trip and a cryptic 400. Required for UX and defense in depth. |
| "We'll add validation later." | 'Later' ships an injection/garbage-data path. Unvalidated input is not done. |

## Red flags

- An endpoint that reads `req.body.x` and uses it without parsing/validating first.
- A trust decision (role, ownerId, price, quantity) taken from client-supplied data unchecked.
- Client and server validating with two separate, hand-maintained rule sets (they will drift).
- A form with no error states, or a server that returns 200 on invalid input.

## Verification

- The endpoint rejects invalid/malformed/edge input at the boundary (test it with a bad payload, not just the UI).
- The client validates for UX **and** handles the server's rejection.
- Client and server share one schema (no drift), and the error path has tests.
