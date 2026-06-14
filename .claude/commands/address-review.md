---
description: Address-review phase — pull a PR's reviewer feedback (bots like Gemini Code Assist + humans), triage by severity (auto-fix valid high/critical findings test-first; surface medium/low for the human to decide), reply with reasoning, and iterate until none remain.
argument-hint: [PR number — defaults to the current branch's PR]
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(git:*), Bash(gh:*), Bash(npx:*)
---

You are in the **Address-review** phase. A PR is open and reviewers — automated (Gemini Code Assist, CodeRabbit, …) and human — have left feedback. Close that loop the way Ship closes the CI loop: triage, fix what's right, justify what isn't, iterate.

## The feedback under review

- **PR:** $ARGUMENTS (default: the current branch's PR)
- **Reviews:** !`gh pr view ${ARGUMENTS:-} --json reviews -q '.reviews[] | "[\(.author.login)] \(.state): \(.body[0:200])"' 2>/dev/null | head -30 || echo "no PR / gh unavailable"`
- **Inline comments:** !`gh api repos/{owner}/{repo}/pulls/$(gh pr view ${ARGUMENTS:-} --json number -q .number 2>/dev/null)/comments -q '.[] | "[\(.user.login)] \(.path):\(.line)\n  \(.body[0:300])"' 2>/dev/null | head -60 || echo "none / gh unavailable"`
- **Gate:** !`npx --no-install keel eval 2>&1 | tail -5 || echo "run: pnpm exec keel eval"`

## Do

1. **Triage every comment by severity — verify first, then act on autonomy.** For each piece of feedback first judge **validity**: **fix** (correct and in scope), **decline** (wrong, out of scope, or contradicts a spec/invariant — reply with the reason), or **defer** (valid but belongs in its own spec/issue). A bot is often right but not always — verify the claim against the code before changing anything; never apply what you can't justify. Then apply the **severity policy** for what's valid:
   - **High / critical → fix it now, autonomously. Don't wait for the human.** Severity is the reviewer's own label (e.g. Gemini's high/critical marker) or your assessment — a correctness, security, data-loss, or crash bug is high. You still verify it's real (decline a "high" you've confirmed is wrong, with reasoning) and you still go through the full fix discipline below; you just don't pause for approval.
   - **Medium / low / style / nit → do NOT auto-fix. Surface it to the human** with your recommendation (fix / decline / defer) and a one-line rationale, and let them decide. These are the judgment calls.
   - **When unsure of severity, treat it as medium** (ask). Reserve autonomous fixing for the clearly-high, clearly-valid ones.
2. **Fix test-first (every fix, auto or approved).** Each fix is a Build slice: write/extend the failing test that encodes the reviewer's case, make it pass, refactor, and keep `keel eval` green. A review fix never bypasses the gate — even a high-severity auto-fix lands only with the gate green.
3. **Spec-first still holds.** If the feedback changes behavior covered by a spec, update the spec + add a `.changelog/` entry (the intake rule). If it's a genuinely new concern, it may warrant its own spec.
4. **Reply on the thread.** For each comment: resolve it with a short note on the fix, or reply with the reasoning for declining/deferring. Don't silently ignore feedback — a closed loop means every comment got an answer.
5. **Push and re-gate**, then **watch for the next round.** Bots re-review after a push and may post new comments seconds-to-minutes later. Poll with `/loop` (e.g. `/loop 2m /keel:address-review`) until a poll returns **no new actionable feedback**. Report the final state; don't stop at "pushed the first fix".

## Done when

Every reviewer comment has an answer: high/critical valid findings **fixed autonomously** (test-first, gate green); medium/low **surfaced to the human** with a recommendation rather than auto-applied; wrong ones declined/deferred with a stated reason — **and** a fresh poll surfaces no new actionable feedback. Merging remains the human's call.
