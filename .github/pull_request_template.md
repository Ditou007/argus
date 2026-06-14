<!-- keel PR template. Every section is required; the gate's PR-description
     check (and reviewers) expect them filled. Keep it honest. -->

## Summary

<What this PR does, in two or three sentences.>

## Type of change

<!-- delete those that don't apply -->
feat · fix · docs · refactor · perf · test · chore · ci · build

## Motivation

<Why now? Link the spec / issue / ADR this implements.>

## Changes

<The notable changes, as a list. Reviewers read this first.>

## Impact

<Behavioral, API, schema, or migration impact. "None" is a valid answer — say so explicitly.>

## Testing

<How this was verified: the tiers exercised, `keel eval` result, manual steps if any.>

## Checklist

- [ ] `keel eval` is green locally (no weakened thresholds, no grandfathered new violations).
- [ ] Specs/docs updated in this PR for any behavior change (spec-sync / doc-sync pass).
- [ ] A changeset is included if a published package changed.
- [ ] No secret committed; no sensitive value logged.
