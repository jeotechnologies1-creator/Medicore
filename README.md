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

The last migration adds encounters, structured allergy/intolerance and problem lists, medication orders, care plans/goals, clinical tasks, consent records, persisted alerts, safety indexes, and vital-sign alerting. The **Clinical Safety** screen provides the working workflow for maintaining allergies, problems and care plans.

## Required production setup

`clinical_safety.sql` deliberately removes the legacy `profiles.password` field. Create staff accounts in **Supabase Auth** (email/password or SSO) instead. A profile is created or linked by email on first sign-up; a super admin must then assign its `role` in `profiles`. The automatic first role is `receptionist`, never administrator.

The migration replaces the legacy `using (true)` policies so anonymous users cannot access records. The new clinical tables also use role- and patient-aware policies. Before going live, refine the transitional authenticated-user policies on older tables into least-privilege, role-specific policies; test them with every role, and keep the Supabase service-role key strictly server-side.

This is a clinical application, so it should also have a privacy review, a retention/backup plan, encrypted device/session management, a data-processing agreement where applicable, and clinical governance before real patient data is entered. It is not presented as a certified EHR.
