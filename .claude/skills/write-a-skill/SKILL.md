---
name: write-a-skill
description: Author a new keel skill in the enforcement anatomy — Process · Rationalizations · Red flags · Verification — small, composable, and config-driven. Use when adding or revising a skill.
---

# write-a-skill

A skill is a discipline made teachable. keel skills follow one anatomy so they read consistently and so the soft-enforcement (rationalizations + red flags) survives even when no check runs.

## Process

1. **One discipline per skill.** If it needs "and", split it. Small and composable beats big and vague.
2. **Frontmatter:** `name` (kebab) + a `description` that says *what* and *when to use* — the description is how discovery picks it.
3. **The four sections, in order:**
   - **Process** — the numbered steps to do it right.
   - **Rationalizations** — a table of `excuse | rebuttal`. This is the anti-rationalization core; name the lies you'll tell yourself.
   - **Red flags** — observable signs you're doing it wrong.
   - **Verification** — the evidence required to claim it's done (prefer a `keel <check>` where one exists).
4. **Read config, don't hardcode.** Refer to `keel.config.json` knobs by name; never bake a threshold into prose.
5. **Defer, don't duplicate.** If a gstack/builtin skill already does it, write a thin pointer, not a copy.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "I'll just write prose, the anatomy is rigid." | The anatomy is what makes a skill *enforce* instead of merely advise. Keep it. |
| "This skill can cover two things." | Two disciplines in one skill means neither is findable or composable. Split. |
| "Hardcoding the number is clearer." | It drifts from the gate the moment config changes. Reference the knob. |

## Red flags

- A skill with no Rationalizations or Verification section.
- A hardcoded threshold that duplicates a config value.
- A skill that restates an existing gstack/builtin skill.

## Verification

- All four sections present and in order.
- No hardcoded knob that exists in config.
- Verification names a `keel` check where one applies.
