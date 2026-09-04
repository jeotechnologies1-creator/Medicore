# MediCore

MediCore is a browser-based EMR/Hospital Management System backed by Supabase.

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

Do not load synthetic patient or staff records into a live project. Use the real registration, staff provisioning, and clinical workflows instead.

The last migration adds encounters, structured allergy/intolerance and problem lists, medication orders, care plans/goals, clinical tasks, consent records, persisted alerts, safety indexes, and vital-sign alerting. The **Clinical Safety** screen provides the working workflow for maintaining allergies, problems and care plans.

## Required production setup

`clinical_safety.sql` deliberately removes the legacy `profiles.password` field. Create staff accounts in **Supabase Auth** (email/password or SSO) instead. A profile is created or linked by email on first sign-up; a super admin must then assign its `role` in `profiles`. The automatic first role is `receptionist`, never administrator.

`production_hardening.sql` replaces the temporary "any authenticated user" policies with staff/patient-scoped policies and creates a private document bucket. Test it using every role before entering patient data, and keep the Supabase service-role key strictly server-side.

The same migration creates server-side audit triggers for clinical and operational changes. Audit records are read-only to application users and visible only to a super administrator.

This is a clinical application, so it should also have a privacy review, a retention/backup plan, encrypted device/session management, a data-processing agreement where applicable, and clinical governance before real patient data is entered. It is not presented as a certified EHR.

See [EMR_GO_LIVE_CHECKLIST.md](EMR_GO_LIVE_CHECKLIST.md) for the interoperability, safety, security, and operational controls required before go-live.
