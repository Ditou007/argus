---
name: interview
description: Force the right thinking before any spec or code. Extract requirements one question at a time, push past the polished first answer, and refuse to finalize until every acceptance criterion is concrete enough to become a failing test. Use at the start of any feature, and as the questioning engine behind /keel:spec.
---

# interview

Vague requirements produce wrong software efficiently. A spec is only as good as the thinking behind it — so the interview's job is to **force the right thinking**, not to collect answers politely. It synthesizes two sources: the YC office-hours posture (gstack `/office-hours`) — *specificity is the only currency*, *the first answer is never the real one* — and Matt Pocock's grill (the `grill-me` and `grill-with-docs` skills from mattpocock/skills): **interview relentlessly, walk every branch of the decision tree, recommend an answer to each question, and explore the codebase instead of asking when the answer is already there.**

This skill is the questioning engine behind the Define phase (`/keel:spec`). It does not end when you have answers — it ends when the spec would pass `spec-quality`: every "Done" line concrete enough to become a test.

## Process

1. **Start with why → who → what.** Motivation first — it disambiguates everything downstream — then the actor, then the behavior.
2. **One question at a time, and recommend an answer.** Ask one question, propose the answer you'd pick and why, and let the user confirm or correct. Each answer steers the next; a batch gets ten skimmed answers and a false sense of done. (Matt Pocock's grill.)
3. **Explore before you ask.** If the codebase, config, or an existing spec already answers a question, answer it yourself and say what you found. Spend the user's attention only on what the code can't tell you.
4. **Walk the decision tree.** Resolve decisions in dependency order — settle the choice an answer depends on before the answer itself. Don't leave a branch half-open and move on.
5. **Specificity is the only currency — push past the first answer.** The first answer is the polished version; the real criterion is usually a question deeper. "Users get rate-limited" isn't a criterion — *which* users, after *how many* requests, in *what window*, and *what do they see* when it trips? Force a name, a number, an observable outcome.
6. **Sharpen the language, and check it against the code.** Pin fuzzy or overloaded terms to one canonical word ("you said *account* — the Customer or the User? Those are different things"); load the `domain-modeling` skill when the terms are the hard part. When the user states how something works, verify the code agrees and surface any contradiction. (Matt Pocock's `grill-with-docs`.)
7. **Make the implicit explicit, then reflect back.** Invent concrete edge scenarios that force precision — the empty, error, concurrent, and abuse cases, plus the non-goals — then reflect "so when X, the system does Y, and Z is out of scope" and let them correct you. An unstated edge case is a bug waiting in the Build phase.
8. **Loop until it's testable — don't finalize early.** Run the **completeness checklist** below after each answer. If any item is still vague, ask again. Stop only when every Done criterion could be handed to the Build phase as a failing test — or on an explicit user override ("ship it as-is"). An underspecified spec is a failure, not a fast path.

> **Record the load-bearing decisions.** When the grill settles something **hard to reverse, surprising without context, and the result of a real trade-off**, capture it via the `adr` skill — sparingly. If any of the three isn't true, skip it; you'd just reverse it. (Matt Pocock's ADR rule.)

## The forcing posture (anti-sycophancy)

The interview is rigorous, not agreeable. Comfort means you haven't pushed hard enough.

- **Take a position on every answer**, and say what evidence would change it — that's rigor, not hedging.
- **Never** say "that's interesting," "that could work," or "you might want to consider…". Say *"this is underspecified because…"* or *"this will break when…"*.
- **Name the failure pattern** when you see it: *solution in search of a problem*, *happy-path-only*, *unstated error behavior*, *acceptance criterion that can't become a test*, *scope creep past the PR-size budget*.
- **Challenge the strongest version** of the requirement, not a strawman.

## The completeness checklist (the loop's exit condition)

The interview is not done until every box is true — this is what `/keel:spec` writes into the spec's **Done**:

- [ ] **Actor & trigger** named — who or what, doing what, when.
- [ ] **Observable outcome** stated as a criterion a test can assert (a value, a status, a state — not "works well").
- [ ] **Error / empty / edge / abuse behavior** specified, not assumed.
- [ ] **Non-goals** explicit — what this change is deliberately *not* doing.
- [ ] **Each Done line maps to a named test** the Build phase can write red-first.
- [ ] **Scope fits** one reviewable change (else split it in the Plan phase).

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "I'll ask everything up front to save time." | A batch gets skimmed answers. The sharpest questions are the ones the previous answer reveals. |
| "I can infer what they want." | Inference is where rework comes from. Confirm the assumption that would be expensive to get wrong. |
| "It's obvious, no need to ask." | If it's obvious, the question is cheap and confirms it. If it isn't, you just dodged a rebuild. |
| "They gave me an answer, so we're done." | The first answer is the polished version. Push again — the real criterion is usually one question deeper. |
| "Good enough, I'll tighten the spec later." | "Later" is after the code exists, when the spec becomes documentation of an accident. Tighten it now, while it's still the contract. |

## Red flags

- Designing or coding before you can state the acceptance criteria.
- A requirement with no defined error/empty/edge behavior.
- A "Done" line that can't be turned into a test (too vague to assert).
- Accepting a vague answer because pushing felt uncomfortable.
- An assumption load-bearing for the design that nobody confirmed.

## Verification

- Every item in the completeness checklist is true.
- Acceptance criteria are written and the stakeholder agrees they're right.
- Edge/error/empty behavior is specified, not assumed; non-goals are explicit.
- The resulting spec passes `spec-quality` (Goal · Tasks · Done, with concrete criteria).
