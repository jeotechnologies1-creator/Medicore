# Database Schema Map

**Source:** SQL files in `supabase/`. This is a repository schema inventory, not an introspection of the deployed database. Verify names, constraints and RLS on the target project before migration.

## Core identity and operations

- `profiles` links Supabase Auth identities to application role/status and optional patient identity.
- `organization_units`, `job_positions`, `staff_organization_memberships` define a configurable organization tree and effective-dated staff links. `permission_catalog`, `role_permission_grants`, and `profile_permission_assignments` store explicit permissions and temporary scoped overrides; the helper is not yet applied to all legacy clinical table policies.
- `patients` owns stable patient UUID and demographics; patient-facing links use `patient_id`.
- `facilities`, `facility_bank_accounts`, `medical_offices`, `office_staff` represent partial organization/location models.
- `appointments` links patient and provider/schedule/status.
- `wards` owns ward capacity/occupancy; `beds` references ward and current admission.

## Clinical and workflow

- `encounters` references patient and registration/attending profile; case type, emergency/BID data and closure fields are extended by `hospital_workflows.sql`.
- `vital_signs`, `consultations`, `immunizations`, `patient_allergies`, `patient_conditions`, `medication_orders`, `care_plans`, `care_plan_goals`, `clinical_tasks`, `patient_consents`, `clinical_alerts`, `nursing_notes`, `intake_output_records`, `pain_assessments`, `emergency_visits` represent clinical records.
- `encounter_workflow_events` is append-only history; workflow completion attaches encounter IDs to diagnostic, prescription, administration, surgery and admission records where supported.
- `clinical_record_versions` supports version history; `patient_access_logs` records chart access.
- `admissions` links patient, encounter, requested ward, bed, clinician and disposition.
- `surgeries` links patient, encounter, request/review/scheduling and operative fields.

## Orders, results and medication

- `lab_orders`, `radiology_orders` link patient and, after workflow migrations, encounter; results/reports and validation state remain on owning order records with acknowledgement support.
- `prescriptions` and `medication_orders` have different legacy/current uses and need a documented consolidation boundary before schema redesign.
- `medication_administrations` records administration separately.
- `pharmacy_inventory` is the current inventory foundation; lot movement/stock ledger completeness is not established.
- `result_acknowledgements`, `medication_reconciliations` are added by `quality_safety_upgrade.sql`.

## Revenue, communication, governance

- `billing`, `payment_submissions`, `insurance_claims`, `insurance_memberships`, `insurance_eligibility_checks`, `facility_bank_accounts` cover partial revenue workflows.
- `patient_messages`, `medication_refill_requests` support portal communication.
- `patient_documents` metadata and private Storage bucket/policies support attachments.
- `patient_next_of_kin`, `family_cards`, `family_card_members`, `patient_record_referrals` support identity/coordination.
- `notifications`, `audit_logs`, `compliance_exports`, `fhir_exchange_jobs`, `downtime_events`, `system_settings` support platform governance.

## Relationship summary

`patient 1—N encounter`; `encounter 1—N observations/notes/orders`; `patient 1—N appointments/admissions/documents`; `admission N—1 bed` (one active assignment enforced through transactional workflow/constraints); `ward 1—N beds`; `order 1—N result acknowledgement`; `profile 1—N authored/audit events`; `patient 1—N family membership/insurance membership`. Confirm exact FK and delete behavior in SQL before relying on this summary.

## Risks and migration rules

- Historical schema has overlapping insurance, medication, and organization concepts. Avoid destructive consolidation until application queries and existing rows are reconciled.
- Migrations are ordered SQL scripts, not a generated migration ledger with per-environment state in this repo. Several historical policy scripts are not idempotent; apply to a clone/staging database and maintain a tested recovery plan.
- Role authorization and later workflow migrations replace earlier permissive policies. Do not skip or reorder them.
- `clinical_department_rls.sql` adds restrictive department-scope checks across clinical records, linked care-plan goals, encounter workflow events, and result acknowledgements. The unit code or name must match the clinical record's department value where one is present.
- Every new patient-linked table needs RLS, grants, indexes/FKs, audit behavior and a patient merge strategy. Identity-merge code must be updated transactionally whenever patient-linked tables are added.
- No deployed schema, row counts, migration history, or SQL lint result was available in this audit.
