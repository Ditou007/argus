---
name: context-hygiene
description: Keep the working context lean and accurate — read narrowly, summarize findings not dumps, drop stale assumptions, and re-verify recalled facts against the live code. Use during long sessions or when context is filling up.
---

# context-hygiene

A forward gap: the reference harnesses manage *files*, not *attention*. A bloated or stale context degrades every decision after it. Treat context as a scarce, curated resource.

## Process

1. **Read narrowly.** Pull the lines you need, not whole files "to be safe." Breadth searches return conclusions, not file dumps.
2. **Summarize, don't accumulate.** After exploring, write the *finding* (the answer + the `file:line`) and let the raw output fall away. Carry conclusions forward, not transcripts.
3. **Re-verify recalled facts.** A fact remembered from earlier — or from a memory/handoff — reflects what was true *then*. If it names a file/function/flag, confirm it still exists before acting on it.
4. **Drop stale hypotheses explicitly.** When evidence kills an assumption, state that it's dead so it doesn't resurface.
5. **Hand off before the cliff.** When context is filling, write a `handoff` and start fresh rather than degrading.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "Read the whole file, it's safer." | It crowds out the signal and you still grep for the one function. Read the span. |
| "I remember how this works." | You remember how it worked when you last looked. Re-verify the detail you're about to rely on. |
| "Keep everything in context, just in case." | 'Just in case' is how context dies. Curate to what the current step needs. |

## Red flags

- Re-reading a file you just edited "to confirm."
- Acting on a remembered path/flag without checking it exists.
- A context full of raw tool output and no distilled findings.

## Verification

- Findings are recorded as conclusions + `file:line`, not raw dumps.
- Any recalled file/flag was re-confirmed against the live tree.
- A handoff exists before context is exhausted.
