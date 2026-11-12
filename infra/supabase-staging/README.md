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

`db reset` is destructive to this **local staging database only**. It creates a clean database and applies the ordered migration chain through `20261112000032_critical_lab_in_app_alerts.sql`. Migration 29 intentionally stops if patient rows have no `home_facility_id`; the clean staging database has no patients. Keep test fixtures synthetic; do not load identifiable production patient data.

The local API, database, Studio, and mail UI use ports `55421`, `55422`, `55423`, and `55424`, respectively. Use `supabase --workdir infra/supabase-staging status` to inspect local credentials and endpoints. Stop the stack with:

```sh
supabase --workdir infra/supabase-staging stop
```

## Promotion gate

Do not promote migrations to a hosted project until the clean migration chain is applied, the verification query in [the rollback plan](../../docs/deployment/rollback-clinical-record-retention.md) returns a restrictive false `DELETE` policy for each present clinical table, and read/update workflows pass using synthetic authenticated roles. For migration 29, first verify that every staging patient is assigned to its correct facility and validate read, registration, scheduling, insurance, and family-card access for patient, receptionist, records officer, clinician, finance, and super-admin roles. For migration 30, verify the synthetic HIM facility membership can request/release/return a file, cannot directly update register rows, and is denied in the second facility. For migration 31, verify patients see only final/corrected lab results while clinicians and laboratory staff retain access to in-progress rows. For migration 32, finalize a synthetic critical result and confirm only the assigned clinician receives an in-app notification; verify an unassigned legacy result notifies active Super Admins, and a correction reopens its acknowledgement row. No external channel is implemented. Rollbacks are prepared at `supabase/rollback/20261103000026_clinical_record_retention.sql`, `supabase/rollback/20261103000030_him_records.sql`, `supabase/rollback/20261111000031_lab_result_patient_visibility.sql`, and `supabase/rollback/20261112000032_critical_lab_in_app_alerts.sql`.

This local stack validates database behavior. A separate hosted staging project is still needed to validate deployed Auth settings, Edge Function secrets, custom domains, and Cloudflare routing. Never link this local migration workdir to the production project.
