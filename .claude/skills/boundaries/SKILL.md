---
name: boundaries
description: Pure core, I/O at the edges, dependencies injected — the architecture that makes logic testable and side effects controllable. Generalizes Route→Service→Domain. Use when structuring a module, service, or feature.
---

# boundaries

The shape that keeps software testable and changeable: a **pure core** of business logic surrounded by a **thin shell** that does I/O. Decisions in the middle, effects at the edge. (Route→Service→Domain is one instance of this; so is ports-and-adapters.)

## Process

1. **Push I/O to the edges.** Network, DB, filesystem, clock, randomness, env — all at the boundary, in adapters. The core receives data and returns data.
2. **Inject dependencies; don't reach for them.** The core takes its collaborators as arguments (or a constructor). No module-level singletons reached from inside logic (the lone exception: a logger).
3. **Three layers** in the typical service: an **edge** that parses/validates untrusted input and formats output, a **logic** layer that's pure and decides, and **adapters** that perform the I/O the logic asks for.
4. **Validate at the boundary, trust within.** Parse untrusted input into a known type at the edge; the core never re-checks shapes it was handed.
5. **Dependencies point inward.** The core knows nothing of HTTP, the DB driver, or the framework. The edge depends on the core, not vice versa.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "Just call the DB here, it's simpler." | Now this logic can't be tested without a database and can't be reused off that path. Inject it. |
| "Dependency injection is ceremony." | It's the seam that makes the core unit-testable and the adapter swappable. That's not ceremony, it's the point. |
| "The validation can happen deeper." | Validation deep in the core means every internal caller must re-trust. Parse once, at the edge. |

## Red flags

- Business logic that imports the HTTP framework or the DB client directly.
- A function that's impossible to unit-test without standing up infrastructure.
- `new Date()` / `fetch` / `process.env` inside a decision function.

## Verification

- The core is unit-testable with plain inputs, no real I/O.
- All I/O lives in injected adapters at the edge.
- Untrusted input is parsed to a type at the boundary, trusted thereafter.
