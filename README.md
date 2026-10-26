# OneMed

OneMed is a browser-based EMR/Hospital Management System backed by Supabase.

## Front-end structure

The app uses ordered browser scripts (no bundler is required). `src/app.js` is now the small application entry point; supporting code lives in `src/js/`:

- `core.js` — data normalizers, loading, and common utilities
- `icons.js`, `ui.js`, `auth.js`, `layout.js` — reusable UI, authentication, and navigation
- `modules/` — feature screens grouped by domain: dashboard, patients, diagnostics, operations, administration, system, portal, people, and clinical care

Keep the script order in `index.html`, because each file deliberately uses the shared browser scope from the files before it.

## Clinical safety upgrade

Run the SQL files in this order in the Supabase SQL editor:

1. `supabase/schema.sql`
2. `supabase/medical_offices.sql`
3. `supabase/office_staff.sql`
4. `supabase/wards_beds_insurance.sql`
5. `supabase/clinical_modules.sql`
6. `supabase/clinical_safety.sql`
7. `supabase/patient_portal.sql`
8. `supabase/production_hardening.sql`
9. `supabase/atomic_pharmacy_dispensing.sql`
10. `supabase/quality_safety_upgrade.sql`
11. `supabase/app_activation.sql`
12. `supabase/legacy_role_enum_compatibility.sql` (only for legacy projects using `public.user_role`)
13. `supabase/role_authorization.sql`
14. `supabase/safe_core_multibranch.sql`
15. `supabase/receptionist_records_referrals.sql`
16. `supabase/patient_appointment_coordination.sql`
17. `supabase/accounts_payment_approval.sql`
18. `supabase/hospital_workflows.sql`
19. `supabase/workflow_completion.sql`
20. `supabase/organization_permissions.sql`
21. `supabase/finance_posting_refunds.sql`
22. `supabase/clinical_department_rls.sql`

Do not load synthetic patient or staff records into a live project. Use the real registration, staff provisioning, and clinical workflows instead.

OneMed has no seed script and never persists clinical records in browser storage. It reads from and writes to Supabase only; if Supabase is unavailable, records remain empty and clinical saves fail safely.

`clinical_safety.sql` adds encounters, structured allergy/intolerance and problem lists, medication orders, care plans/goals, clinical tasks, consent records, persisted alerts, safety indexes, and vital-sign alerting. The **Clinical Safety** screen provides the workflow for maintaining allergies, problems, and care plans.

`hospital_workflows.sql` adds emergency and Brought In Dead (BID/BOD) intake fields and an append-only encounter workflow history. HIM and reception can open an encounter at its initial arrived state; death-related cases remain pending an authorized clinical assessment. Apply it after the authorization migration.

`workflow_completion.sql` adds family cards, per-patient insurance memberships and manual eligibility history, encounter-linked diagnostic/surgical/inpatient records, and transactional bed allocation/disposition operations. Beds are allocated under a row lock to prevent simultaneous assignment. Apply this migration after `hospital_workflows.sql` and test database permissions in staging before clinical use.

`organization_permissions.sql` adds configurable organization units, reporting positions, effective-dated staff memberships, a permission catalog, scoped role grants, temporary individual overrides, and audit records. `clinical_department_rls.sql` intersects existing clinical role policies with active facility and department membership permissions. Configure organization-unit codes or names to match department values stored on clinical records; untagged records use a staff member's primary unit, or their only active unit. Apply after `finance_posting_refunds.sql` and verify with the local RLS suite before deployment.

`finance_posting_refunds.sql` adds idempotent payment submission, profile-correct payment posting, independent payment review, and two-person refund request/review with immutable reversal records. A recorded reversal is not a bank transfer; external payment execution and general-ledger integration still require an approved provider and reconciliation.

For a disposable local Supabase environment, run `supabase start`, `supabase db reset`, then `npm run test:db`. The `supabase/migrations/` entries point to the ordered SQL files above, and database tests use synthetic fixtures that roll back. Do not run `supabase db reset` against a linked/hosted project.

## Required production setup

`clinical_safety.sql` deliberately removes the legacy `profiles.password` field. Create staff accounts in **Supabase Auth** (email/password or SSO) instead. A profile is created or linked by email on first sign-up; a super admin must then assign its `role` in `profiles`. The automatic first role is `receptionist`, never administrator.

`production_hardening.sql` replaces the temporary "any authenticated user" policies with staff/patient-scoped policies and creates a private document bucket. Test it using every role before entering patient data, and keep the Supabase service-role key strictly server-side.

The same migration creates server-side audit triggers for clinical and operational changes. Audit records are read-only to application users and visible only to a super administrator.

`quality_safety_upgrade.sql` adds result acknowledgement records, overdue-result escalation support, medication reconciliation records, and optional terminology/barcode/lot fields. Configure a server-side scheduled job to call `escalate_overdue_results()`; it is intentionally not callable from the browser.

`app_activation.sql` is the final compatibility migration. It enables the staff directory required by appointment and office assignment screens, makes notifications private to their recipient, prevents inactive accounts from being considered clinical staff, and adds indexes for active application queries.

`role_authorization.sql` must be applied last. It resets all inherited policies for clinical, portal, profile, notification, and audit tables before applying role-specific database authorization. It also restricts clinical authorship by record type, aligns document storage with document-write roles, and adds write-time data-integrity constraints. Test every role in staging after applying it; validate the new `NOT VALID` constraints after resolving any legacy-data exceptions.

Deploy the staff-provisioning Edge Function after applying the SQL migrations:

```sh
supabase functions deploy create-staff
```

The function at `supabase/functions/create-staff/index.ts` requires the project-managed `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` secrets. Do not place the service-role key in the browser or this repository.

This is a clinical application, so it should also have a privacy review, a retention/backup plan, encrypted device/session management, a data-processing agreement where applicable, and clinical governance before real patient data is entered. It is not presented as a certified EHR.

## Downtime and recovery

Maintain an approved read-only/downtime procedure outside this repository: paper or approved offline forms, a unique downtime encounter identifier, a named recovery owner, a reconciliation queue, and a tested restoration drill. Never enter live patient data until the procedure, backups, recovery-time target, and restoration testing are approved by clinical governance.

See [EMR_GO_LIVE_CHECKLIST.md](EMR_GO_LIVE_CHECKLIST.md) for the interoperability, safety, security, and operational controls required before go-live.

## Architecture and workflow documentation

The repository audit, current module status, target organogram, schema map, patient journey, departmental handoffs, role/security model, integration catalogue, implementation roadmap, test plan, and operations runbook are maintained under [`docs/`](docs/architecture/repository-audit.md). Status labels in those documents distinguish implemented, partial, planned, and unverified capabilities; they do not certify deployment readiness.
