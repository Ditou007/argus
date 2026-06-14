---
name: db-migration
description: Zero-downtime schema change discipline — expand/contract, reversible migrations, backfill safely, never a destructive change in the same deploy as the code that needs it. Use when changing a database schema or migrating data.
---

# db-migration

The gap none of the reference harnesses cover: they migrate *code* (deprecation), not *data*. A schema change is deployed alongside running code reading the old shape — so it must be backward-compatible at every intermediate step.

## Process

1. **Expand, then contract** — never both at once:
   - **Expand:** add the new column/table/index as nullable/optional. Old code ignores it; new code can use it. Deploy.
   - **Backfill:** populate the new shape in batches, idempotently, off the hot path. Verify.
   - **Migrate reads/writes:** ship code that uses the new shape. Deploy.
   - **Contract:** only once nothing reads the old shape, drop it. Separate deploy.
2. **Every migration is reversible** — a `down` that's tested, or an explicit, documented forward-only with a rollback plan.
3. **Backfills are batched and idempotent** — re-runnable after a failure mid-way, bounded per batch, never one giant transaction.
4. **No destructive change in the same deploy as the code that depends on it** — that's the classic "deploy order" outage.
5. **Additive-only on a hot table during peak**; schedule locking changes for low traffic.

## Rationalizations

| Excuse | Rebuttal |
| --- | --- |
| "Just rename the column, it's quick." | A rename is a drop+add — old code 500s the instant you deploy it. Expand/contract. |
| "Backfill in one UPDATE." | One UPDATE locks the table and can't resume after a timeout. Batch it. |
| "We'll never roll back." | The deploy that needs rollback is the one you didn't write a `down` for. Write it. |

## Red flags

- A migration that drops/renames a column in the same PR as the code change.
- A backfill with no batching or no idempotency.
- A migration with no down / no rollback plan.

## Verification

- The change is decomposed into expand → backfill → migrate → contract steps.
- The migration is reversible (tested `down`) or has a documented rollback.
- Backfill is batched and idempotent.
