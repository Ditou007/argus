---
name: security
description: Validate input at the boundary, handle secrets and egress safely, default-deny, and apply OWASP thinking to every change. Use when touching auth, input handling, external calls, or anything user-reachable.
---

# security

Security is a property of every change, not a phase. The default posture is deny; trust is granted explicitly and narrowly.

## Process

1. **Validate untrusted input at the boundary** — parse with a schema, infer the type, reject the rest. Never trust a shape you didn't validate (no `!`, no `as` on external data).
2. **Authorize server-side.** The client states intent; the server decides. Scope every query by the caller's identity — never trust an ID from the request body.
3. **Secrets stay in a manager / env**, never in code, logs, or audit. keel's `secret-scan` blocks committed secrets; don't rely on it as your only line.
4. **Control egress.** Know every outbound call; default-deny destinations in sensitive contexts. No data leaves the trust boundary unintentionally.
5. **OWASP lens** on each change — injection, broken authz, SSRF, deserialization, secrets exposure. Ask "how would I abuse this?"
6. **Never log sensitive data** — types and counts, not values.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "Input's from our own frontend." | A frontend is a public API with extra steps. Validate server-side regardless. |
| "We'll add authz later." | "Later" ships an open endpoint. Default-deny from the first commit. |
| "Logging the payload helps debugging." | It also leaks PII/secrets into a system with weaker access controls. Log shapes, not values. |

## Red flags

- A request-body field used as a trust decision (role, teamId, ownerId).
- A secret literal, or a secret in a log line.
- An outbound call to a host derived from user input with no allow-list.

## Verification

- `keel secret-scan` is green.
- Every external input is schema-validated at the boundary.
- Authorization is server-side and scoped; no sensitive values logged.
