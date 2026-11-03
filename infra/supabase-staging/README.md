# OneMed local migration staging

This is an isolated local Supabase stack for applying and testing migrations before any hosted project. It has its own project ID and ports, no seed data, and reads the ordered migrations from the repository through `supabase/migrations`. It does not connect to production.

## Requirements

- Docker Desktop running.
- Supabase CLI installed.

## Start and test

Run from the repository root:

```sh
supabase --workdir infra/supabase-staging start
supabase --workdir infra/supabase-staging db reset
supabase --workdir infra/supabase-staging test db
```

`db reset` is destructive to this **local staging database only**. It creates a clean database and applies the ordered migration chain, including `20261103000026_clinical_record_retention.sql`. The SQL tests then run against that local database. Keep staging synthetic; do not load identifiable production patient data.

The local API, database, Studio, and mail UI use ports `55421`, `55422`, `55423`, and `55424`, respectively. Use `supabase --workdir infra/supabase-staging status` to inspect local credentials and endpoints. Stop the stack with:

```sh
supabase --workdir infra/supabase-staging stop
```

## Promotion gate

Do not promote the migration to a hosted project until the clean migration chain and database tests pass, the verification query in [the rollback plan](../../docs/deployment/rollback-clinical-record-retention.md) returns a restrictive false `DELETE` policy for each present clinical table, and read/update workflows pass using synthetic authenticated roles. The rollback file is prepared at `supabase/rollback/20261103000026_clinical_record_retention.sql`.

This local stack validates database behavior. A separate hosted staging project is still needed to validate deployed Auth settings, Edge Function secrets, custom domains, and Cloudflare routing. Never link this local migration workdir to the production project.
