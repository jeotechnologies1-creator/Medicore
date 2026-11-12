# OneMed

OneMed is a browser-based EMR/Hospital Management System backed by Supabase.

## Front-end structure

The front end is built with Vite, React 18, Tailwind CSS, and ES modules. `src/main.js` loads the existing feature modules in their current dependency order; the module exports keep the shared application API available while the screens are migrated to direct imports. React, Supabase, Tailwind, and Inter are bundled or self-hosted; the login CAPTCHA uses Cloudflare Turnstile as its dedicated verification origin.

Install the pinned dependencies, configure `.env` from `.env.example`, and build the static site:

```sh
npm install
npm run dev
npm run build
```

Production response headers are in `public/_headers`; the static host must preserve that file and send the listed headers. `src/app.js` is the React application shell; supporting screens live in `src/js/`:

- `core.js` — data normalizers, loading, and common utilities
- `icons.js`, `ui.js`, `auth.js`, `layout.js` — reusable UI, authentication, and navigation
- `modules/` — feature screens grouped by domain: dashboard, patients, diagnostics, operations, administration, system, portal, people, and clinical care

Keep the script order in `index.html`, because each file deliberately uses the shared browser scope from the files before it.

## Database migrations and staging deployment

`supabase/migrations/` is the only authoritative schema-change stream. Supabase applies timestamped migrations in order; do not apply migration SQL by hand or use the hosted SQL Editor. The old SQL snapshots are retained under [`supabase/legacy/`](supabase/legacy/README.md) for reference only.

Link this checkout to the staging project and push the pending migrations there first:

```sh
supabase link --project-ref "$STAGING_PROJECT_REF"
supabase db push --remote
supabase migration list --remote
```

Review the migration list and run the staging acceptance checks before promoting the same reviewed migration commit to production. For a pre-existing project, reconcile its remote migration history against the actual schema on a staging copy before pushing; do not mark migrations applied based only on their filenames. For a disposable local database, use `supabase start`, `supabase db reset`, and `npm run test:db`. Never run `supabase db reset` against a linked or hosted project.

Run `node scripts/check-migrations.mjs` before committing schema changes. It checks that each migration is a regular timestamped file, has transaction-scoped lock and statement timeouts, and has a matching rollback plan.

Before pushing migration `20261103000029` to staging, inventory existing patients with a null `home_facility_id` and assign each to its verified facility. Unassigned records remain visible only to the linked patient and Super Admin; staff cannot access them until mapped. The migration never guesses a facility. Treat its rollback file as a reviewed plan; encode any approved reversal as a new forward migration and push that migration through the staging workflow.

Migration `20261111000031` follows HIM migration `20261103000030`. It limits patient Data API reads of laboratory orders to results with `result_status` `final` or `corrected`; verify patient, clinician, and laboratory access in staging before promotion. Its rollback drops only the additional restrictive policy.

Migration `20261112000032` follows migration 31. It sends finalized critical lab results to the assigned active clinician through the existing in-app notification feed; legacy critical results without an active clinician alert active Super Admins for assignment. It also reopens acknowledgement tracking when a final result is corrected. No SMS, email, or push delivery is configured. Verify recipient visibility and corrected-result behavior in staging.

Do not load synthetic patient or staff records into a live project. Use the real registration, staff provisioning, and clinical workflows instead.

OneMed has no seed script and never persists clinical records in browser storage. It reads from and writes to Supabase only; if Supabase is unavailable, records remain empty and clinical saves fail safely.

`supabase/migrations/20261026000006_clinical_safety.sql` adds encounters, structured allergy/intolerance and problem lists, medication orders, care plans/goals, clinical tasks, consent records, persisted alerts, safety indexes, and vital-sign alerting. The **Clinical Safety** screen provides the workflow for maintaining allergies, problems, and care plans.

`supabase/migrations/20261026000017_hospital_workflows.sql` adds emergency and Brought In Dead (BID/BOD) intake fields and an append-only encounter workflow history. HIM and reception can open an encounter at its initial arrived state; death-related cases remain pending an authorized clinical assessment. The timestamped stream applies it after the authorization migration.

`supabase/migrations/20261026000018_workflow_completion.sql` adds family cards, per-patient insurance memberships and manual eligibility history, encounter-linked diagnostic/surgical/inpatient records, and transactional bed allocation/disposition operations. Beds are allocated under a row lock to prevent simultaneous assignment. The timestamped stream applies it after `supabase/migrations/20261026000017_hospital_workflows.sql` and test database permissions in staging before clinical use.

`supabase/migrations/20261026000019_organization_permissions.sql` adds configurable organization units, reporting positions, effective-dated staff memberships, a permission catalog, scoped role grants, temporary individual overrides, and audit records. `supabase/migrations/20261026000021_clinical_department_rls.sql` intersects existing clinical role policies with active facility and department membership permissions. Configure organization-unit codes or names to match department values stored on clinical records; untagged records use a staff member's primary unit, or their only active unit. It follows `supabase/migrations/20261026000020_finance_posting_refunds.sql` and verify with the local RLS suite before deployment.

`supabase/migrations/20261026000020_finance_posting_refunds.sql` adds idempotent payment submission, profile-correct payment posting, independent payment review, and two-person refund request/review with immutable reversal records. `supabase/migrations/20261026000022_external_finance_integrations.sql` adds provider-neutral payer claim submission, gateway checkout, signed webhook ingestion, retryable outbox processing, remittance review, and immutable balanced general-ledger journals. `supabase/migrations/20261026000023_patient_portal_chat_payments.sql` adds the portal chat inbox, facility-scoped HIM appointment coordination, and patient-owned checkout requests. Configure the `integration-dispatch` and `integration-webhook` Edge Functions with server-side secrets using the contract in `supabase/DEPLOYMENT.md`. Vendor-specific sandbox mappings and credentials are required before live external connectivity; no vendor is preconfigured.

`supabase/migrations/20261103000024_document_storage_scope.sql` restricts private patient document objects to the patient's authorized facility/department scope and configures the bucket to accept PDF/JPEG/PNG files up to 10 MiB.

For a disposable local Supabase environment, run `supabase start`, `supabase db reset`, then `npm run test:db`. The numbered migration files are regular files and database tests use synthetic fixtures that roll back. Do not run `supabase db reset` against a linked/hosted project.

## Required production setup

`supabase/migrations/20261026000006_clinical_safety.sql` deliberately removes the legacy `profiles.password` field. Create staff accounts in **Supabase Auth** (email/password or SSO) instead. A profile is created or linked by email on first sign-up; a super admin must then assign its `role` in `profiles`. The automatic first role is `receptionist`, never administrator.

`supabase/migrations/20261026000008_production_hardening.sql` replaces the temporary "any authenticated user" policies with staff/patient-scoped policies and creates a private document bucket. Test it using every role before entering patient data, and keep the Supabase service-role key strictly server-side.

The same migration creates server-side audit triggers for clinical and operational changes. Audit records are read-only to application users and visible only to a super administrator.

`supabase/migrations/20261026000010_quality_safety_upgrade.sql` adds result acknowledgement records, overdue-result escalation support, medication reconciliation records, and optional terminology/barcode/lot fields. Configure a server-side scheduled job to call `escalate_overdue_results()`; it is intentionally not callable from the browser.

`supabase/migrations/20261026000011_app_activation.sql` enables the staff directory required by appointment and office assignment screens, makes notifications private to their recipient, prevents inactive accounts from being considered clinical staff, and adds indexes for active application queries.

The timestamped stream applies `supabase/migrations/20261026000012_role_authorization.sql` after `supabase/migrations/20261026000011_app_activation.sql` and before subsequent workflow migrations. It resets inherited policies before applying role-specific authorization. Later workflow migrations add narrow policies and grants for their new features. It also restricts clinical authorship by record type, aligns document storage with document-write roles, and adds write-time data-integrity constraints. Validate the new `NOT VALID` constraints after resolving any legacy-data exceptions.

Deploy the staff and patient-portal account provisioning Edge Functions after applying the SQL migrations:

```sh
supabase functions deploy create-staff
supabase functions deploy create-patient-portal
```

Both functions require the project-managed `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` secrets. The patient portal account form calls `create-patient-portal`; deploy it or that workflow will fail. Do not place the service-role key in the browser or this repository.

This is a clinical application, so it should also have a privacy review, a retention/backup plan, encrypted device/session management, a data-processing agreement where applicable, and clinical governance before real patient data is entered. It is not presented as a certified EHR.

## Downtime and recovery

Maintain an approved read-only/downtime procedure outside this repository: paper or approved offline forms, a unique downtime encounter identifier, a named recovery owner, a reconciliation queue, and a tested restoration drill. Never enter live patient data until the procedure, backups, recovery-time target, and restoration testing are approved by clinical governance.

See [EMR_GO_LIVE_CHECKLIST.md](EMR_GO_LIVE_CHECKLIST.md) for the interoperability, safety, security, and operational controls required before go-live.

## Architecture and workflow documentation

The repository audit, current module status, target organogram, schema map, patient journey, departmental handoffs, role/security model, integration catalogue, implementation roadmap, test plan, and operations runbook are maintained under [`docs/`](docs/architecture/repository-audit.md). Status labels in those documents distinguish implemented, partial, planned, and unverified capabilities; they do not certify deployment readiness.
