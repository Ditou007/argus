---
name: deprecation-migration
description: Code is a liability — retire it deliberately. Deprecate with a replacement and a removal date, migrate callers, then delete. Never leave a half-dead path. Use when removing or replacing an API, flag, or module.
---

# deprecation-migration

Every line of code is a maintenance cost. Removing code is as much engineering as adding it — done carelessly it breaks consumers; done well it shrinks the surface you have to defend.

## Process

1. **Deprecate, don't yank.** Mark the old path deprecated (annotation/log/doc) *with* a pointer to the replacement and a **removal date or version**. A deprecation with no end date is permanent debt.
2. **Provide the replacement first.** The new path must exist and be documented before the old one is discouraged — never deprecate into a vacuum.
3. **Migrate the callers** you own in the same effort; track external ones. Use codemods where the change is mechanical.
4. **Announce the removal** in the changeset/changelog (a `major` if it's a published breaking change) with migration steps.
5. **Delete on schedule.** Once callers are migrated and the window has passed, remove the code, its tests, its docs, and its feature flags. A dead path left "just in case" is a trap for the next reader.
6. **Retire flags too** — a flag that's been 100% rolled out is dead code with a config switch. Remove it.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "Leave the old function, it's harmless." | It's a second way to do the thing, an untested path, and a question every reader must resolve. Delete it. |
| "Deprecate now, remove someday." | "Someday" is never. Set the date when you deprecate, or you've just added permanent debt. |
| "The flag might be needed again." | Re-add it from git if so. A stale flag is a live branch you don't test. |

## Red flags

- A `@deprecated` with no replacement named and no removal date.
- Two code paths doing the same thing "for now".
- A fully-rolled-out flag still in the code; dead code kept "just in case".

## Verification

- Every deprecation names its replacement and a removal date/version.
- Callers you own are migrated; the removal is announced (changeset for published).
- On removal, the code + its tests + docs + flags are all gone — no orphans.
