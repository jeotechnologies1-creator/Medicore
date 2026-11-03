# Pre-migration rollback plan: clinical record retention

**Status: written before migration execution. The migration has not been run by this change.**

## Change and impact

Migration `20261103000026_clinical_record_retention.sql` changes only restrictive `DELETE` row-level security policies on clinical tables. It performs no row updates, table rewrites, or backfills. Authenticated Data API clients will no longer be able to hard-delete those clinical records. Reads, inserts, and updates retain their existing policies. Service-role workflows bypass RLS and must remain server-side and audited.

Policy DDL is grouped in one PostgreSQL `DO` statement, so policy replacements commit together. A short lock timeout makes the migration fail and roll back instead of waiting behind a long-running transaction. This avoids an application outage; as with any DDL, PostgreSQL may briefly wait for a table lock.

## Before starting

1. Apply the full migration chain to the isolated local stack in `infra/supabase-staging` first, or to a dedicated **non-production hosted Supabase project**. Do not link this run to the production project. See [local staging instructions](../../infra/supabase-staging/README.md).
2. Use synthetic patients and accounts only. Do not copy identifiable production health data into staging unless it has been formally de-identified and approved.
3. Take or confirm a recent recoverable staging backup. Record the staging project ref and the currently applied migration version.
4. Confirm an active `authenticated` test user can read clinical records and that ordinary authorized updates still work.
5. Save the rollback file `supabase/rollback/20261103000026_clinical_record_retention.sql` and confirm its contents before applying the forward migration.
6. Run the policy verification query and an authenticated delete-denial check in staging. Continue only if reads and updates still work and delete attempts are denied.

## Rollback triggers

Rollback only if the migration causes an unexpected access regression or blocks a documented clinical workflow. Since no rows are changed by this migration, rollback is a policy restoration, not a data restore. Do not use rollback as a way to delete clinical records.

## Rollback procedure

1. Stop further promotion to production and record the observed failure, time, role, table, and request ID.
2. Run `supabase/rollback/20261103000026_clinical_record_retention.sql` against the **same staging project** first.
3. Confirm the previous department-scoped delete policy is restored and verify clinical reads, writes, and audit workflows.
4. If staging confirms the rollback resolves the regression, run that rollback file against production only through the approved production change process.
5. Record the rollback in the deployment log. The rollback restores the department-scoped delete policy that existed before this migration, so authenticated users who already had that permission can delete again.

## Verification query

After forward migration, each present table in the migration's list should have a restrictive `DELETE` policy with a false condition:

```sql
select tablename, policyname, permissive, cmd, qual
from pg_policies
where schemaname = 'public'
  and policyname = 'department clinical delete'
order by tablename;
```

Expect `permissive = 'RESTRICTIVE'`, `cmd = 'DELETE'`, and `qual = 'false'` for every listed table that exists in the project.
