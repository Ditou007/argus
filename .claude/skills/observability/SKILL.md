---
name: observability
description: Make the system explain itself — structured logs with an event field, metrics on the paths that matter, traceable requests, and never a sensitive value in a log. Use when adding a service path, a job, or anything you'll need to debug in production.
---

# observability

You debug production through what the system emits. If a path can fail, it must be observable — structured, queryable, correlated — or you're guessing in an incident. (Extends `code-craft`'s logging rule into the operational dimension.)

## Process

1. **Structured logs, always.** Every log line is an object with an `event` field (a stable name) plus context — never a printf string, never `console.*`. You query events, not grep prose.
2. **Log at the decision and the boundary** — the request in/out, the branch taken, the failure with its cause. Not every line; the ones you'd want in an incident.
3. **Correlate.** Propagate a request/trace id so one request's events can be stitched across components.
4. **Metrics on what matters** — rate, errors, duration on the hot paths; a counter on the thing you'll be asked "how often does X happen?".
5. **Never log sensitive data.** PII/secrets are types-and-counts, never values. A redaction bug is a breach.
6. **Make failures loud and specific** — an error log names what failed and why, with enough context to act without a repro.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "I'll add logging when something breaks." | When it breaks in prod at 2am, the logs you didn't add aren't there. Instrument the path now. |
| "A console.log is fine for now." | Unstructured, unqueryable, and it leaks to stdout in prod. Use the structured logger with an event. |
| "Logging the payload helps debugging." | It also writes PII/secrets to a lower-trust system. Log shapes and ids, not values. |

## Red flags

- A failure path that logs nothing, or logs an opaque "error occurred".
- `console.*` in service code; unstructured string logs.
- A payload, token, or PII value in a log line; no request correlation id.

## Verification

- Logs are structured with an `event` field; no `console.*` in service paths.
- Failure paths log a specific, actionable cause; requests are correlatable.
- No sensitive value is logged (types/counts only); hot paths have metrics.
