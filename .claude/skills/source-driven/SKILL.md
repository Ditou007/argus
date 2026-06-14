---
name: source-driven
description: Ground decisions in the official source — the actual docs, the API reference, the code — not memory or a plausible guess. Cite what you relied on. Use when using an unfamiliar API, library, or platform feature.
---

# source-driven

Memory of an API is a cache that goes stale and was never authoritative. A plausible-looking call that doesn't exist costs more than the minute it takes to check the docs. Ground the decision in the source and cite it.

## Process

1. **Find the authoritative source** — the official docs, the type definitions, the actual library code in `node_modules`, the platform reference. Not a blog, not memory.
2. **Read the specific thing** you're about to use — the signature, the options, the return shape, the version it landed in. Confirm it exists in *this* version.
3. **Prefer the type definitions / source** over prose docs when they disagree — the code is what runs.
4. **Cite what you relied on** so the next reader (and reviewer) can verify — a link, a file path, a version.
5. **When the source is silent or contradictory, say so** and verify empirically (a tiny spike), rather than guessing confidently.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "I'm pretty sure the method is called that." | "Pretty sure" about an API is how hallucinated calls ship. Open the docs. |
| "The blog post showed it this way." | Blogs lag and simplify. The official reference / types are what the runtime honors. |
| "Checking docs slows me down." | Slower than debugging a method that never existed? Check first. |

## Red flags

- An API call written from memory without confirming it in this version.
- A decision justified by "I think" with no source.
- Following a tutorial whose version doesn't match yours.

## Verification

- The API/signature used was confirmed against the official source for the installed version.
- Non-obvious choices cite their source.
- Where the source was unclear, it was verified empirically, not guessed.
