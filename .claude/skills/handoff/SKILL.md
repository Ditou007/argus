---
name: handoff
description: Write a complete session handoff so a fresh context (or another engineer) can resume without loss — state, decisions, what's done, what's next, and the gotchas. Use when ending a session mid-task or compacting context.
---

# handoff

A handoff is a save-state for a task. Written well, the next session resumes in one read; written badly, it re-discovers everything you already learned.

## Process

1. **State the goal** in one line — what "done" looks like for the whole task.
2. **What's done** — the slices completed, with the commits/files that prove it.
3. **What's next** — the immediate next action, concretely (not "continue the work").
4. **Decisions made** — the choices you locked and *why*, so they're not relitigated.
5. **Gotchas** — the non-obvious things you learned the hard way (a flaky step, an env quirk, a misleading error). This is the highest-value section.
6. **How to verify** — the command that proves the current state is green.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "I'll remember where I was." | The next context is not you. It has the files, not your working memory. |
| "The git log says what I did." | The log says *what*, not *why* or *what's left* or *what nearly broke*. |
| "Too detailed is wasteful." | The gotchas you omit are the hour the next session spends rediscovering them. |

## Red flags

- A handoff that says "continue" with no concrete next action.
- Decisions stated without their rationale.
- No verification command.

## Verification

- A fresh reader could take the next action without asking a question.
- Every "done" claim has a file/commit behind it.
- The verify command actually shows green.
