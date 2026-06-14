---
name: performance
description: Measure before optimizing, kill unbounded work (N+1, full scans, unbounded loops), create pools/clients once, set explicit timeouts, and hold to budgets. Use when touching hot paths, data access, or anything latency-sensitive.
---

# performance

Performance work is measured, not guessed. The biggest wins are almost never the clever micro-optimization — they're the unbounded query and the connection created per request.

## Process

1. **Measure first.** Profile or benchmark the real path before changing anything. Optimize what the data says is slow, not what you assume.
2. **Kill unbounded work** — no N+1 queries, no full-table scans on a hot path, no unbounded loops over user-controlled input. Paginate; bound everything.
3. **Create expensive things once.** Connection pools, HTTP clients, compiled regexes — module/app scope, not per-request. (This is the rare exception to "no module-level singletons": clients, yes; mutable state, no.)
4. **Explicit timeouts** on every I/O call. A call with no timeout is an outage waiting for a slow dependency.
5. **Async correctly** — don't block the event loop; don't await in a loop what could be `Promise.all`.
6. **Hold to budgets** (`budgets.*` in config — bundle size, Web Vitals) where they apply.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "This loop is probably fine." | "Probably" over a user-controlled list is an O(n²) incident. Bound it or measure it. |
| "Let me optimize this while I'm here." | Unmeasured optimization adds complexity for no proven gain. Measure or leave it. |
| "Timeouts are an edge case." | The edge case is a slow dependency taking your whole service down. Set the timeout. |

## Red flags

- A query inside a loop (N+1).
- A new client/pool constructed inside a request handler.
- An `await` inside a `for` that could parallelize; an I/O call with no timeout.

## Verification

- A measurement justifies any optimization made.
- No unbounded query/loop on the changed path; pools created once.
- Every new I/O call has an explicit timeout; budgets met where they apply.
