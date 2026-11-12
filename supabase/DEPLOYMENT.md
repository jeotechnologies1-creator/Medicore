# OneMed database activation

## Hosted Auth settings required before launch

Local and staging `config.toml` files disable self-registration, require email confirmation, and require secure password changes. These files do not change an already hosted Supabase project's settings. In each hosted Supabase Dashboard, open **Authentication → Settings** and disable new user signups, enable email confirmations, and enable secure password changes. Apply these settings to every hosted environment before allowing users to sign in. Staff and patient portal accounts must be provisioned through the approved Edge Functions; new Auth identities remain pending with the `unassigned` role until that workflow activates them.

Migration `20261112000034_financial_facility_scope.sql` derives financial record facilities from each patient's verified `home_facility_id` and linked parent rows. Rows whose patient has no verified facility remain NULL and are restricted to Super Admin. Reconcile missing facility assignments in staging; never assign facilities from the current user's membership. The migration adds a facility derivation trigger and restrictive facility membership checks to billing, claims, payments, refunds, disputes and remittances.

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
13. `safe_core_multibranch.sql`
14. `receptionist_records_referrals.sql`
15. `patient_appointment_coordination.sql`
16. `accounts_payment_approval.sql`
17. `hospital_workflows.sql`
18. `workflow_completion.sql`
19. `organization_permissions.sql`
20. `finance_posting_refunds.sql`
21. `clinical_department_rls.sql`
22. `external_finance_integrations.sql`
23. `patient_portal_chat_payments.sql`
24. `document_storage_scope.sql`
25. `specialist_clinical_authoring.sql`
26. `clinical_record_retention.sql`
27. `migrations/20261103000027_payment_dispute_workflow.sql`
28. `appointment_slot_integrity.sql` (or `migrations/20261103000028_appointment_slot_integrity.sql`)
29. `patient_facility_scope.sql` (or `migrations/20261103000029_patient_facility_scope.sql`)
30. `him_records.sql` (or `migrations/20261103000030_him_records.sql`)
31. `migrations/20261111000031_lab_result_patient_visibility.sql`
32. `migrations/20261112000032_critical_lab_in_app_alerts.sql`

The front-end calls the following database contracts:

| App workflow | Database requirement |
| --- | --- |
| Sign-in, roles, staff directory | `profiles`, `auth.users`, `clinical_safety.sql`, `app_activation.sql` |
| Patient registration and appointments | `patients`, `appointments`, `schema.sql`, `production_hardening.sql` |
| Laboratory and radiology results | `lab_orders`, `radiology_orders`, `quality_safety_upgrade.sql` |
| Medication dispensing | `pharmacy_inventory`, `prescriptions`, `dispense_prescription(uuid)` from `atomic_pharmacy_dispensing.sql` |
| Documents | `patient_documents` plus the private `patient-documents` Storage bucket from `production_hardening.sql` |
| Patient portal assistant, HIM chat inbox, appointment request routing, and patient checkout | `patient_messages` plus facility scoped `portal.message.*` and `portal.appointment.manage` grants, and `request_patient_payment_checkout(...)` from `patient_portal_chat_payments.sql` |
| Patient chart read auditing and active patient-linked access | `patient_access_logs`, `safe_core_multibranch.sql` |
| HIM patient registry, emergency intake, and chart access | `records_officer` profile role, encounter intake, identity verification, and patient-record RLS from `role_authorization.sql`, `safe_core_multibranch.sql`, `hospital_workflows.sql`, and `workflow_completion.sql` |
| Reception referrals to HIM | `patient_record_referrals` and role-scoped policies from `receptionist_records_referrals.sql` |
| Patient portal booking and HIM scheduling | Patient-owned requests, appointment booking/confirmation, `get_appointment_providers()`, and patient confirmation notifications from `patient_appointment_coordination.sql` |
| Family cards and insurance membership | `family_cards`, individual family memberships, `insurance_memberships`, and manual eligibility history from `workflow_completion.sql` |
| Ward admission and bed occupancy | `request_inpatient_admission`, `allocate_requested_admission`, and `complete_inpatient_disposition` from `workflow_completion.sql` |
| Encounter journey and BID/BOD | Encounter workflow events, unidentified emergency registration, and guarded identity merge/death assessment functions from `hospital_workflows.sql` and `workflow_completion.sql` |
| Notifications | `notifications` and recipient-scoped policies from `app_activation.sql` |
| Payment review | `payment_submissions` and `review_payment_submission(uuid,text)` from `accounts_payment_approval.sql`; payments remain pending until Accounts approval |
| Result acknowledgement and reconciliation | `result_acknowledgements`, `medication_reconciliations` from `quality_safety_upgrade.sql` |
| Organization chart and scoped permission assignments | `organization_units`, `job_positions`, `staff_organization_memberships`, `permission_catalog`, and permission-grant tables from `organization_permissions.sql` |
| Payment idempotency, posting, and refund approval | `submit_payment_for_approval`, `review_payment_submission`, `request_billing_refund`, and `review_billing_refund` from `finance_posting_refunds.sql` |
| Facility and department authorization | Restrictive clinical and finance RLS checks in `clinical_department_rls.sql` and `finance_posting_refunds.sql`; staff need an active membership in the matching facility and unit |
| External payer, payment gateway, and GL | `external_finance_integrations.sql` adds claims, checkout intents, a durable outbox/inbox, normalized webhooks, remittance review, balanced journals, and a provider-neutral Edge adapter |
| Payment disputes and chargeback alerting | `migrations/20261103000027_payment_dispute_workflow.sql` adds provider dispute intake, an auditable response queue, and configurable provider-specific count/rate alerts |
| Patient registry privacy and scheduling | `patient_facility_scope.sql` scopes patient-linked reads and writes, prevents authenticated hard deletes of retained patient/clinical rows, and validates appointment RPC writes and provider facility membership; `appointment_slot_integrity.sql` prevents same-time patient/doctor double bookings |
| HIM physical file circulation | `him_records.sql` adds facility-bound file indexing, request/release/return/missing/investigation transitions, append-only movement events, and `records.file.read/manage` permissions. Apply after #29 and test with active HIM facility membership in staging first. |
| Patient laboratory-result visibility | `migrations/20261111000031_lab_result_patient_visibility.sql` limits patient reads to finalized or corrected results while retaining staff visibility under existing RLS. Apply after #30 and verify patient, clinician, and laboratory roles in staging. |
| Critical laboratory result alerting | `migrations/20261112000032_critical_lab_in_app_alerts.sql` sends finalized critical results to the assigned active clinician through the in-app feed; unassigned legacy results alert active Super Admins. Corrections reopen acknowledgement tracking. No external notification channel is configured. Apply after #31 and verify in staging. |
| HIM access administration | Organization Structure → “Health Information Management (HIM) access” edits facility scoped `records_officer` grants; staff also need an active facility membership. Patient checkout still requires an active payment gateway connection and uses the existing provider webhook and Accounts review path. |

Before applying migration 29, run `select count(*) from public.patients where home_facility_id is null;` in staging and reconcile every result against the verified source facility. The migration does not guess or bulk-assign facilities: unassigned patients remain available to their linked patient and Super Admin, but hidden from facility/department staff until explicitly mapped. Super Admin can assign `home_facility_id` after verifying the patient's actual facility. Validate existing staff facility/department memberships and the active registration roles in staging as part of promotion.

Rollbacks are prepared at `supabase/rollback/20261103000027_payment_dispute_workflow.sql`, `supabase/rollback/20261103000028_appointment_slot_integrity.sql`, `supabase/rollback/20261103000029_patient_facility_scope.sql`, `supabase/rollback/20261103000030_him_records.sql`, `supabase/rollback/20261111000031_lab_result_patient_visibility.sql`, and `supabase/rollback/20261112000032_critical_lab_in_app_alerts.sql`. For migration 29, stop writes during rollback and use its staging-first instructions; it removes the scope policies and restores the prior broader role policies. Migration 30 rollback requires pausing file movements and exporting all three HIM tables before removing them. Migration 31 rollback removes only the additional restrictive read policy; the older role authorization also applies the same patient result-status condition. Migration 32 rollback removes the alert trigger and restores the former acknowledgement trigger behavior; existing notifications and acknowledgement records remain. The published operational refund notice is available at `/refund-policy.html`; it does not invent refund timing or eligibility terms absent from facility configuration.

## Required non-SQL deployment

Deploy the staff provisioning endpoint after the SQL migration succeeds:

```sh
supabase functions deploy create-staff
supabase functions deploy create-patient-portal
supabase functions deploy integration-dispatch
supabase functions deploy integration-webhook
```

`create-staff` and `create-patient-portal` are called by the staff administration and patient portal provisioning screens. Both provisioning functions and the finance integration functions need `SUPABASE_SERVICE_ROLE_KEY` in Edge Function secrets. Never expose that key in the front end.

The finance integration functions run only with the server-side service-role key. Configure connector secrets with `supabase secrets set`; never put credentials in `integration_connections.config` or browser code. Create one active connection row for each facility/provider in the Supabase SQL editor, using only non-secret settings, for example `insert into public.integration_connections(facility_id,integration_type,provider_code,status) values ('<facility-uuid>','payment_gateway','example_gateway','active');`. `MEDICORE_CONNECTORS_JSON` maps each `provider_code` to a base URL, secret variable name, and optional checkout return URL, for example `{"example_gateway":{"baseUrl":"https://sandbox.example.invalid/api/","tokenEnv":"EXAMPLE_GATEWAY_TOKEN","returnUrl":"https://hospital.example/checkout/return"}}`. The dispatcher uses fixed routes for `payment.intent.create`, `payer.claim.submit`, and `ledger.journal.posted`; each provider must accept the canonical JSON body and the `Idempotency-Key` header or be wrapped with a vendor-specific adapter. A gateway intent response can include `{ "id": "provider-reference", "checkout_url": "https://..." }`; the URL is stored only when HTTPS. Configure `MEDICORE_WEBHOOK_SECRET_<CONNECTION_UUID_WITHOUT_DASHES_UPPERCASE>` per connection. Webhooks must send `x-medicore-connection`, `x-provider-signature: sha256=<HMAC-SHA256-of-raw-body>`, and JSON `{ "event_id": "...", "event_type": "payment.succeeded|payment.failed|payer.claim.accepted|payer.claim.adjudicated|payer.remittance|payment.dispute.opened|payment.dispute.updated|payment.dispute.closed", "data": { ... } }`. Payment events identify `transaction_id`; payer events identify `claim_id`, adjudications also include `amount_approved`, and remittances include `amount`. Dispute events include `dispute_id`; `payment.dispute.opened` also includes `transaction_id` and may include `amount`, `reason`, and `response_due_at`. Configure warning/critical count and/or rate thresholds in Operations → Billing → Disputes & Alerts. Rates use posted transactions in the selected lookback period. These are operator settings, not processor compliance limits; set them to your provider contract. An unconfigured provider raises a daily configuration-required alert. The inbox deduplicates provider event IDs; payment successes create a pending payment submission and still require independent Accounts review. Schedule `integration-dispatch` with a server-side Supabase service-role bearer token to drain/retry outbox events.

These contracts are vendor-neutral. No payer, gateway, or GL vendor credentials/API contract is configured in this repository; live connectivity requires mapping each vendor’s auth, fields, signature scheme, and response semantics to the canonical contract above. Do not configure production connections until that mapping has been validated against each vendor sandbox.

The staff form creates active `records_officer`, `surgeon`, `specialist`, and `theatre_staff` accounts. On projects where `profiles.role` is a legacy enum, run `legacy_role_enum_compatibility.sql` before `role_authorization.sql`; `workflow_completion.sql` adds the theatre role values. HIM staff can register and link patient records, while clinical records and private documents retain their role-scoped write rules.

## Post-deployment checks

1. Create or link the initial account in Supabase Auth, then promote its `profiles.role` to `super_admin` manually.
2. Create one account for each role and confirm its permitted screens and rows only.
3. Upload and read a document as a clinician; confirm a Records Officer can read it but cannot upload or delete files, and a patient can read only their own document.
4. Dispense a multi-item prescription and verify stock, lot choice, prescription state, and audit event in one transaction.
5. Finalize a lab or radiology result and confirm a `result_acknowledgements` row is created.
6. Configure a server-side schedule to invoke `public.escalate_overdue_results()` and test an overdue acknowledgement in staging.
7. Confirm an inactive user is signed out, then test each staff role cannot create or update a record outside its assigned workflow (including direct REST requests).
8. Review any pre-existing rows that violate the new `NOT VALID` integrity constraints, remediate them, and run `VALIDATE CONSTRAINT` for each in a planned maintenance window.
9. Confirm patient-linked reads are denied to inactive profiles and that opening a chart creates one row in `patient_access_logs` for the authenticated active profile.
