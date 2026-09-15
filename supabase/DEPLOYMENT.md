# MediCore database activation

Apply these files in the Supabase SQL Editor, in this exact order, to a new project. Each script is additive/idempotent where practical; always test upgrades against a staging copy first.

1. `schema.sql`
2. `medical_offices.sql`
3. `office_staff.sql`
4. `wards_beds_insurance.sql`
5. `clinical_modules.sql`
6. `clinical_safety.sql`
7. `patient_portal.sql`
8. `production_hardening.sql`
9. `atomic_pharmacy_dispensing.sql`
10. `quality_safety_upgrade.sql`
11. `app_activation.sql`
12. `role_authorization.sql`

The front-end calls the following database contracts:

| App workflow | Database requirement |
| --- | --- |
| Sign-in, roles, staff directory | `profiles`, `auth.users`, `clinical_safety.sql`, `app_activation.sql` |
| Patient registration and appointments | `patients`, `appointments`, `schema.sql`, `production_hardening.sql` |
| Laboratory and radiology results | `lab_orders`, `radiology_orders`, `quality_safety_upgrade.sql` |
| Medication dispensing | `pharmacy_inventory`, `prescriptions`, `dispense_prescription(uuid)` from `atomic_pharmacy_dispensing.sql` |
| Documents | `patient_documents` plus the private `patient-documents` Storage bucket from `production_hardening.sql` |
| Portal messages and refill requests | `patient_messages`, `medication_refill_requests` from `patient_portal.sql` |
| Notifications | `notifications` and recipient-scoped policies from `app_activation.sql` |
| Result acknowledgement and reconciliation | `result_acknowledgements`, `medication_reconciliations` from `quality_safety_upgrade.sql` |

## Required non-SQL deployment

Deploy the staff provisioning endpoint after the SQL migration succeeds:

```sh
supabase functions deploy create-staff
```

`create-staff` is the only front-end-invoked function that is not a Postgres function. It uses `SUPABASE_SERVICE_ROLE_KEY` in the Supabase Edge Function environment. Never expose that key in the front end.

## Post-deployment checks

1. Create or link the initial account in Supabase Auth, then promote its `profiles.role` to `super_admin` manually.
2. Create one account for each role and confirm its permitted screens and rows only.
3. Upload and read a document as a clinician; confirm a patient can read only their own document.
4. Dispense a multi-item prescription and verify stock, lot choice, prescription state, and audit event in one transaction.
5. Finalize a lab or radiology result and confirm a `result_acknowledgements` row is created.
6. Configure a server-side schedule to invoke `public.escalate_overdue_results()` and test an overdue acknowledgement in staging.
7. Confirm an inactive user is signed out, then test each staff role cannot create or update a record outside its assigned workflow (including direct REST requests).
8. Review any pre-existing rows that violate the new `NOT VALID` integrity constraints, remediate them, and run `VALIDATE CONSTRAINT` for each in a planned maintenance window.
