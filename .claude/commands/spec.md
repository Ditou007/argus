---
description: Define phase — turn an intent into a spec that is the source of truth (Goal · Tasks · Done), wired into the doc hierarchy, and committed before any code.
argument-hint: [intent — what to build]
allowed-tools: Read, Write, Edit, Glob, Bash(ls:*), Bash(git:*)
---

You are in the **Define** phase. The output is a spec, not code.

- **Intent:** $ARGUMENTS
- **Scaffolding available:** !`ls docs-system/ 2>/dev/null || echo "docs-system/ not found — adopt keel (keel init) or scaffold by hand"`

First read `.claude/skills/spec-driven/SKILL.md`, `.claude/skills/living-docs/SKILL.md`, and `.claude/skills/interview/SKILL.md` (the forcing-question engine).

## Do

1. **Triage: existing spec or new?** Scan `docs/specs/` first. If the request belongs to a spec **already in place**, this is a *change*: update that spec (its Tasks/Done) **and add a dated `.changelog/` ledger entry** naming that spec (only when the spec actually changed — never a gratuitous entry; see `.changelog/README.md`). If nothing matches, it's a **new feature**: scaffold a new `SPEC_NN` from `docs-system/`. (A higher-level shift may also touch BRD/PRD/TRD.)
2. **Grill against the draft — don't finalize early.** Run the `interview` skill, working **against the spec document itself** (not a side conversation):
   - **Draft early, mark every gap.** Scaffold the spec from `docs-system/SPEC.template.md` immediately, and write an explicit `[OPEN: <the unanswered question>]` marker everywhere you don't yet have a concrete answer — actor, trigger, the observable outcome, each error/empty/edge case, the non-goals, the acceptance test for each Done line.
   - **Grill one marker at a time.** Ask **one question at a time** (start from the intent above; if it's empty, the first marker is "what's the outcome?"), and **push past the first, polished answer** — specificity is the only currency. When an answer is concrete enough to become a failing test, fold it into the spec and delete that `[OPEN: …]` marker. A vague answer keeps the marker and earns a sharper follow-up.
   - **The spec is done only when zero `[OPEN: …]` markers remain** and every item in the completeness checklist is true. Do **not** commit a spec with open markers — that's the grill telling you it isn't clear yet, and when `spec-quality` is enabled the gate **enforces this**: a committed spec carrying a live marker fails `keel eval`. The loop ends only on a clean spec, or an explicit user override ("write it as-is"). A spec that wouldn't pass `spec-quality` isn't done.
3. **Write the spec** with three mandatory sections:
   - **Goal** — the one-sentence outcome and why it matters.
   - **Tasks** — atomic, vertically-sliced steps (each independently shippable + testable).
   - **Done** — the acceptance criteria, phrased so each becomes a test in the Build phase.
4. **Register spec-sync** — if this subsystem should force its spec to be touched on future changes, add a rule to `docs.specSync.rules` in `keel.config.json` (`when` = the code path regex, `requireTouched` = the spec path regex).
5. **Stamp** `**Last updated:**` and a status banner.
6. **Commit the spec on its own** — before any code. Branch off the base (never commit to it directly), then commit just the spec (plus the `.changelog/` entry if this was a *change* to an existing spec) in Conventional form: `docs(spec): <subsystem> — Goal/Tasks/Done`. The spec is the contract; it lands first so the Build phase writes tests against a committed source of truth, and review can see the intent separate from the implementation. (Don't open a PR yet — that's the Ship phase; this commit is the foundation the next phases build on.)

## Done when

The spec's **Done** criteria are concrete enough that the Build phase writes a failing test for each before writing code, **and the spec is committed** (its own `docs(spec): …` commit, no code in it). Then chain to `/keel:plan`.
