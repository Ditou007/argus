---
name: zoom-out
description: Orient before you edit — map an unfamiliar codebase's structure, conventions, and the blast radius of a change before touching it. Use when working in code you don't know well.
---

# zoom-out

Editing unfamiliar code without orienting is how you break three things to fix one. Spend the first minutes building a map: where things live, how this codebase does things, and what your change will ripple into.

## Process

1. **Map the structure first.** Read the entry points, the directory layout, the README/architecture doc. Understand the layers before diving into one file.
2. **Learn the local conventions.** How does *this* repo name things, handle errors, structure tests, log? Match it — consistency beats your personal preference.
3. **Trace the change's blast radius.** Find every caller of what you're about to change (grep, references). A signature change touches everyone who calls it.
4. **Find the pattern to copy.** There's almost always an existing example of the thing you're adding — a sibling route, a similar component. Follow it rather than inventing a new shape.
5. **Then make the smallest change** that fits the existing grain.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "I'll just edit this one file." | One file has callers, tests, and conventions around it. Orient or break them. |
| "My way is cleaner than theirs." | A second style in one codebase is a tax on every future reader. Match the grain; refactor the whole separately. |
| "Grepping for callers is slow." | Slower than a broken caller you didn't know existed? Trace the radius. |

## Red flags

- Editing a function without knowing who calls it.
- Introducing a new pattern next to an established one for the same job.
- Code that's correct but stylistically alien to the file around it.

## Verification

- The change matches the codebase's existing conventions.
- All callers/dependents of changed code were found and considered.
- An existing pattern was followed where one exists.
