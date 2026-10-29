---
name: 'Flyway migrations'
description: 'Use when adding or changing database tables, indexes or Flyway migration scripts.'
applyTo: '**/src/main/resources/db/migration/**'
---
# Flyway migrations

- Never edit an applied migration; add a new `V<yyyyMMddHHmm>__<what>.sql`.
- Report tables are partitioned by `as_of_date`. New indexes must be created per partition with
  `CREATE INDEX CONCURRENTLY` in a separate, non-transactional migration.
- Every migration needs a rollback note in the PR description (Flyway community has no undo).
