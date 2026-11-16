# OneMed database activation

## Hosted Auth settings required before launch

Local and staging `config.toml` files disable self-registration, require email confirmation, and require secure password changes. These files do not change an already hosted Supabase project's settings. In each hosted Supabase Dashboard, open **Authentication → Settings** and disable new user signups, enable email confirmations, and enable secure password changes. Apply these settings to every hosted environment before allowing users to sign in. Staff and patient portal accounts must be provisioned through the approved Edge Functions; new Auth identities remain pending with the `unassigned` role until that workflow activates them.

Migration `20261112000035_mfa_enforcement.sql` enables a default-on database AAL2 gate for `super_admin`, `accountant`, `doctor`, `pharmacist`, `surgeon`, and `specialist`; the System Settings “Require MFA for staff” toggle controls the `system_settings.mfa_enforcement` value. Local and staging config also sets 12-character complex passwords, TOTP, Turnstile CAPTCHA, a 12-hour session timebox, and a 2-hour inactivity timeout. Configure matching values manually in every hosted Auth Dashboard. Set the public Turnstile site key in `window.__ONEMED_CAPTCHA_SITE_KEY__` in the served `index.html`, and provide `SUPABASE_AUTH_CAPTCHA_SECRET` to the local Auth service; the site key is public, but the CAPTCHA secret must stay server-side.

Migration `20261112000034_financial_facility_scope.sql` derives financial record facilities from each patient's verified `home_facility_id` and linked parent rows. Rows whose patient has no verified facility remain NULL and are restricted to Super Admin. Reconcile missing facility assignments in staging; never assign facilities from the current user's membership. The migration adds a facility derivation trigger and restrictive facility membership checks to billing, claims, payments, refunds, disputes and remittances.

## Database migration deployment

`supabase/migrations/` is the sole authoritative database change stream. Apply the ordered timestamped migrations to a dedicated staging project with the Supabase CLI; never apply migration files through the hosted SQL Editor.

```sh
supabase link --project-ref "$STAGING_PROJECT_REF"
supabase db push --remote
supabase migration list --remote
node scripts/check-migrations.mjs
```

Review migration history and run the staging acceptance checks before promoting the same reviewed commit to production. For an existing project, first reconcile its remote migration history with the deployed schema on a staging copy; do not mark versions applied based only on filenames. For local disposable testing, run `supabase start`, `supabase db reset`, and `npm run test:db`. Never run `supabase db reset` against a linked or hosted project.

The front-end calls the following database contracts:

| App workflow | Database requirement |
| --- | --- |
| Sign-in, roles, staff directory | `profiles`, `auth.users`, `migrations/20261026000006_clinical_safety.sql`, `migrations/20261026000011_app_activation.sql` |
| Patient registration and appointments | `patients`, `appointments`, `migrations/20261026000001_schema.sql`, `migrations/20261026000008_production_hardening.sql` |
| Laboratory and radiology results | `lab_orders`, `radiology_orders`, `migrations/20261026000010_quality_safety_upgrade.sql` |
| Medication dispensing | `pharmacy_inventory`, `prescriptions`, `dispense_prescription(uuid)` from `migrations/20261026000009_atomic_pharmacy_dispensing.sql` |
| Documents | `patient_documents` plus the private `patient-documents` Storage bucket from `migrations/20261026000008_production_hardening.sql` |
| Patient portal assistant, HIM chat inbox, appointment request routing, and patient checkout | `patient_messages` plus facility scoped `portal.message.*` and `portal.appointment.manage` grants, and `request_patient_payment_checkout(...)` from `migrations/20261026000023_patient_portal_chat_payments.sql` |
| Patient chart read auditing and active patient-linked access | `patient_access_logs`, `migrations/20261026000013_safe_core_multibranch.sql` |
| HIM patient registry, emergency intake, and chart access | `records_officer` profile role, encounter intake, identity verification, and patient-record RLS from `migrations/20261026000012_role_authorization.sql`, `migrations/20261026000013_safe_core_multibranch.sql`, `migrations/20261026000017_hospital_workflows.sql`, and `migrations/20261026000018_workflow_completion.sql` |
| Reception referrals to HIM | `patient_record_referrals` and role-scoped policies from `migrations/20261026000014_receptionist_records_referrals.sql` |
| Patient portal booking and HIM scheduling | Patient-owned requests, appointment booking/confirmation, `get_appointment_providers()`, and patient confirmation notifications from `migrations/20261026000015_patient_appointment_coordination.sql` |
| Family cards and insurance membership | `family_cards`, individual family memberships, `insurance_memberships`, and manual eligibility history from `migrations/20261026000018_workflow_completion.sql` |
| Ward admission and bed occupancy | `request_inpatient_admission`, `allocate_requested_admission`, and `complete_inpatient_disposition` from `migrations/20261026000018_workflow_completion.sql` |
| Coded clinical terminology | `code_systems`, `concepts`, coded diagnosis/allergy/condition/test/imaging columns, and the uncoded-entry report from `migrations/20261112000038_coded_terminology_foundation.sql` |
| Encounter journey and BID/BOD | Encounter workflow events, unidentified emergency registration, and guarded identity merge/death assessment functions from `migrations/20261026000017_hospital_workflows.sql` and `migrations/20261026000018_workflow_completion.sql` |
| Notifications | `notifications` and recipient-scoped policies from `migrations/20261026000011_app_activation.sql` |
| Payment review | `payment_submissions` and `review_payment_submission(uuid,text)` from `migrations/20261026000016_accounts_payment_approval.sql`; payments remain pending until Accounts approval |
| Result acknowledgement and reconciliation | `result_acknowledgements`, `medication_reconciliations` from `migrations/20261026000010_quality_safety_upgrade.sql` |
| Organization chart and scoped permission assignments | `organization_units`, `job_positions`, `staff_organization_memberships`, `permission_catalog`, and permission-grant tables from `migrations/20261026000019_organization_permissions.sql` |
| Payment idempotency, posting, and refund approval | `submit_payment_for_approval`, `review_payment_submission`, `request_billing_refund`, and `review_billing_refund` from `migrations/20261026000020_finance_posting_refunds.sql` |
| Facility and department authorization | Restrictive clinical and finance RLS checks in `migrations/20261026000021_clinical_department_rls.sql` and `migrations/20261026000020_finance_posting_refunds.sql`; staff need an active membership in the matching facility and unit |
| External payer, payment gateway, and GL | `migrations/20261026000022_external_finance_integrations.sql` adds claims, checkout intents, a durable outbox/inbox, normalized webhooks, remittance review, balanced journals, and a provider-neutral Edge adapter |
| Payer eligibility and claims | `migrations/20261116000063_payer_eligibility_claims_workflow.sql` adds facility scoped payer plans and claim validation rules, expiring eligibility checks, pre-authorization lifecycle records, validated claim batches, denial reasons, linked resubmissions, and normalized response events. Eligibility and authorization submissions use the existing integration outbox and signed webhook. Configure vendor routes and credentials only through the provider-neutral Edge secrets contract; no real payer endpoint, code, or tariff is included. |
| Payment disputes and chargeback alerting | `migrations/20261103000027_payment_dispute_workflow.sql` adds provider dispute intake, an auditable response queue, and configurable provider-specific count/rate alerts |
| Patient registry privacy and scheduling | `migrations/20261103000029_patient_facility_scope.sql` scopes patient-linked reads and writes, prevents authenticated hard deletes of retained patient/clinical rows, and validates appointment RPC writes and provider facility membership; `migrations/20261103000028_appointment_slot_integrity.sql` prevents same-time patient/doctor double bookings |
| HIM physical file circulation | `migrations/20261103000030_him_records.sql` adds facility-bound file indexing, request/release/return/missing/investigation transitions, append-only movement events, and `records.file.read/manage` permissions. Apply after #29 and test with active HIM facility membership in staging first. |
| Patient laboratory-result visibility | `migrations/20261111000031_lab_result_patient_visibility.sql` limits patient reads to finalized or corrected results while retaining staff visibility under existing RLS. Apply after #30 and verify patient, clinician, and laboratory roles in staging. |
| Critical laboratory result alerting | `migrations/20261112000032_critical_lab_in_app_alerts.sql` sends finalized critical results to the assigned active clinician through the in-app feed; unassigned legacy results alert active Super Admins. Corrections reopen acknowledgement tracking. No external notification channel is configured. Apply after #31 and verify in staging. |
| Pending identity and sensitive-write protection | `migrations/20261112000033_pending_auth_access_gate.sql`, `migrations/20261112000035_mfa_enforcement.sql` keep new identities quarantined and require AAL2 for configured staff roles. |
| Financial facility ownership | `migrations/20261112000034_financial_facility_scope.sql` derives patient facility ownership and applies restrictive facility policies to billing and payment records. |
| Edge account and integration controls | `migrations/20261112000036_edge_function_hardening.sql` adds server-only rate-limit and account audit storage. |
| Portal payment account lookup | `migrations/20261112000037_department_service_payments.sql` provides a permission-scoped bank-account lookup for patient checkout instructions. |
| Accounts receivable, accounts payable, and period close | `migrations/20261116000065_accounts_receivable_payable_period_close.sql` provides facility-scoped AR/AP ageing and trial-balance reports, procurement invoice/payment capture with balanced ledger postings, immutable accounting periods, and trigger-enforced rejection of journal entries in closed or uncovered periods. Finance users must use the next open period for corrections. |
| HIM access administration | Organization Structure → “Health Information Management (HIM) access” edits facility scoped `records_officer` grants; staff also need an active facility membership. Patient checkout still requires an active payment gateway connection and uses the existing provider webhook and Accounts review path. |

Before pushing migration 29, use a read-only staging database client to run `select count(*) from public.patients where home_facility_id is null;` and reconcile every result against the verified source facility. The migration does not guess or bulk-assign facilities: unassigned patients remain available to their linked patient and Super Admin, but hidden from facility/department staff until explicitly mapped. Super Admin can assign `home_facility_id` after verifying the patient's actual facility. Validate existing staff facility/department memberships and the active registration roles in staging as part of promotion.

Every timestamped migration has a matching plan under `supabase/rollback/`. These are review artifacts, not an instruction to run ad-hoc SQL. Several early plans deliberately refuse destructive rollback. Encode any approved reversal as a new forward migration, push it to staging with `supabase db push`, verify it, then promote the same commit. For migration 29, pause writes and preserve facility assignments; migration 30 requires pausing file movements and exporting all three HIM tables before any separately approved removal. The published operational refund notice is available at `/refund-policy.html`; it does not invent refund timing or eligibility terms absent from facility configuration.

Migration 65 seeds an open calendar-year accounting period for each facility. Finance staff with `accounting.period.manage` may add future periods and close a balanced period through the RPCs; periods close in chronological order, ranges cannot overlap, and closed periods cannot be reopened or edited. `journal_open_period_guard` checks every inserted ledger journal under a row lock, so a concurrent period close cannot race a new posting into the period. Corrective journals must be new, balanced adjustment entries in the next open period; original ledger rows remain immutable. AR ageing is based on invoice date and current outstanding balance; AP ageing is based on the procurement invoice due date and unpaid balance. Supplier invoices and payments are recorded in NGN to match the current ledger currency and post using the facility's configured AP/expense rules. Billing → General Ledger exposes supplier invoice capture, AP ageing, AR ageing, the trial balance, and period controls. Finance permissions are facility scoped through the organization permission model; clinicians and patients do not receive these reports.

## Required non-SQL deployment

Deploy the staff provisioning endpoint after migrations have been pushed to staging and verified:

```sh
supabase functions deploy create-staff
supabase functions deploy create-patient-portal
supabase functions deploy integration-dispatch
supabase functions deploy integration-webhook
```

`create-staff` and `create-patient-portal` are called by the staff administration and patient portal provisioning screens. Both provisioning functions and the finance integration functions need `SUPABASE_SERVICE_ROLE_KEY` in Edge Function secrets. Never expose that key in the front end.

The finance integration functions run only with the server-side service-role key. Configure connector secrets with `supabase secrets set`; never put credentials in `integration_connections.config` or browser code. Configure one active, non-secret connection per facility/provider through the approved staging administration workflow. `MEDICORE_CONNECTORS_JSON` maps each `provider_code` to a base URL, secret variable name, and optional checkout return URL, for example `{"example_gateway":{"baseUrl":"https://sandbox.example.invalid/api/","tokenEnv":"EXAMPLE_GATEWAY_TOKEN","returnUrl":"https://hospital.example/checkout/return"}}`. The dispatcher uses fixed routes for `payment.intent.create`, `payer.claim.submit`, and `ledger.journal.posted`; each provider must accept the canonical JSON body and the `Idempotency-Key` header or be wrapped with a vendor-specific adapter. A gateway intent response can include `{ "id": "provider-reference", "checkout_url": "https://..." }`; the URL is stored only when HTTPS. Configure `MEDICORE_WEBHOOK_SECRET_<CONNECTION_UUID_WITHOUT_DASHES_UPPERCASE>` per connection. Webhooks must send `x-medicore-connection`, `x-provider-timestamp` (Unix seconds), `x-provider-signature: sha256=<HMAC-SHA256(secret, timestamp + "." + raw_body)>`, and JSON `{ "event_id": "...", "event_type": "payment.succeeded|payment.failed|payer.claim.accepted|payer.claim.adjudicated|payer.remittance|payment.dispute.opened|payment.dispute.updated|payment.dispute.closed", "data": { ... } }`. Payment events identify `transaction_id`; payer events identify `claim_id`, adjudications also include `amount_approved`, and remittances include `amount`. Dispute events include `dispute_id`; `payment.dispute.opened` also includes `transaction_id` and may include `amount`, `reason`, and `response_due_at`. Configure warning/critical count and/or rate thresholds in Operations → Billing → Disputes & Alerts. Rates use posted transactions in the selected lookback period. These are operator settings, not processor compliance limits; set them to your provider contract. An unconfigured provider raises a daily configuration-required alert. The inbox deduplicates provider event IDs; payment successes create a pending payment submission and still require independent Accounts review. Schedule `integration-dispatch` with a server-side Supabase service-role bearer token to drain/retry outbox events.

The payer workflow additionally dispatches `payer.eligibility.check` and `payer.preauthorization.request`. Signed normalized responses use `payer.eligibility.result` (`eligibility_check_id`, status, response, optional reference and expiry), `payer.preauthorization.updated` (`preauthorization_id`, status, response, optional expiry), and `payer.claim.denied` (`claim_id`, required denial reason). Use `npm run test:edge` for deterministic connector tests and `npm run test:db` for pgTAP; the local Supabase database must be running for the latter.

### Paystack and Flutterwave payment gateway setup

Migration `20261116000064_payment_gateway_vendor_adapters.sql` adds Paystack and Flutterwave adapters to `integration-dispatch` and `integration-webhook`. Select the gateway by creating an active `payment_gateway` integration connection whose `provider_code` is `paystack` or `flutterwave`; when a facility has both, the patient portal lets the patient choose one. Vendor hosts and API routes are fixed in the adapters. Outbound checkout/refund events use the existing leased outbox and idempotency keys. Successful webhook events are verified against the vendor API before they become pending payment submissions; Accounts review remains required. Refund approvals enqueue a gateway refund through the same outbox. Disputes map to the existing payment dispute workflow.

Configure only sandbox credentials first. `MEDICORE_CONNECTORS_JSON` stores secret variable names, never credential values. Use the active connection UUID without hyphens, uppercased, as the suffix for each webhook secret. The connection-specific token mapping ensures two facilities can use separate merchant accounts for the same provider:

```json
{
  "paystack": {
    "baseUrl": "https://api.paystack.co",
    "mode": "test",
    "tokenEnvByConnection": { "<CONNECTION_UUID>": "PAYSTACK_SECRET_<CONNECTION_SUFFIX>" },
    "returnUrl": "https://hospital.example/portal/billing"
  },
  "flutterwave": {
    "baseUrl": "https://api.flutterwave.com/v3",
    "mode": "test",
    "tokenEnvByConnection": { "<CONNECTION_UUID>": "FLUTTERWAVE_SECRET_<CONNECTION_SUFFIX>" },
    "returnUrl": "https://hospital.example/portal/billing"
  }
}
```

Set `PAYSTACK_SECRET_<CONNECTION_SUFFIX>` to a Paystack test secret (`sk_test_...`), and set `FLUTTERWAVE_SECRET_<CONNECTION_SUFFIX>` to a Flutterwave test secret (`FLWSECK_TEST-...`). For Paystack, set `MEDICORE_PAYSTACK_WEBHOOK_SECRET_<CONNECTION_SUFFIX>` to the webhook signing secret from its dashboard; during secret rotation, comma-separate current and previous signing secrets. For Flutterwave v3, set `MEDICORE_FLUTTERWAVE_WEBHOOK_SECRET_<CONNECTION_SUFFIX>` to the dashboard webhook secret hash. The default scheme is `v3` and verifies the documented `verif-hash` header; only set `MEDICORE_FLUTTERWAVE_WEBHOOK_SCHEME_<CONNECTION_SUFFIX>=hmac-sha256-base64` if the merchant account is explicitly configured for that signature format. Supply all values through Edge Function secrets, for example `supabase secrets set MEDICORE_CONNECTORS_JSON='...' PAYSTACK_SECRET_<CONNECTION_SUFFIX>='...' MEDICORE_PAYSTACK_WEBHOOK_SECRET_<CONNECTION_SUFFIX>='...'`. Never store credential values in database rows, connector JSON, source control, browser code, test fixtures, or logs. The adapter defaults to test mode and rejects a live-key prefix in that mode. To move a vetted connection to live mode, make the provider's `mode` explicitly `live` and use the vendor-issued live credential in Edge secrets.

Register this callback URL in the provider's **test/sandbox** webhook settings:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/integration-webhook?connection_id=<CONNECTION_UUID>
```

Paystack uses `Paystack-Signature` (timestamped signing secret, with support for its legacy `x-paystack-signature` API-secret format). Flutterwave v3 uses the exact configured `verif-hash` value. Flutterwave chargeback webhook delivery may require enabling the feature with Flutterwave support. The webhook endpoint reads the raw request body, validates the vendor header, deduplicates event IDs in the existing integration inbox, and independently verifies payment completion with the provider API. Keep webhook and API secrets scoped to the corresponding connection.

Vendor documentation reviewed for this adapter: [Paystack webhooks](https://paystack.com/docs/payments/webhooks/), [Paystack transaction initialization and verification](https://paystack.com/docs/api/transaction/), [Paystack refunds](https://paystack.com/docs/payments/refunds/), [Paystack test keys](https://paystack.com/docs/api/authentication/); [Flutterwave webhooks](https://developer.flutterwave.com/docs/webhooks), [Flutterwave standard checkout](https://developer.flutterwave.com/api/charge/standard), [Flutterwave transaction verification](https://developer.flutterwave.com/api/transactions/verify-transaction), [Flutterwave refunds](https://developer.flutterwave.com/api/transactions/transaction-refund), [Flutterwave chargebacks](https://developer.flutterwave.com/docs/payment-operations/chargebacks), and [Flutterwave test keys](https://developer.flutterwave.com/docs/authentication). Use `npm run test:edge` for mocked API calls and recorded webhook fixtures. Running a real sandbox checkout/refund/webhook cycle additionally requires facility-provided sandbox accounts and webhook settings; no live credentials are needed or included.

The staff form creates active `records_officer`, `surgeon`, `specialist`, and `theatre_staff` accounts. The `migrations/20261026000012_role_authorization.sql` migration handles legacy role enums; `migrations/20261026000018_workflow_completion.sql` adds the theatre role values. HIM staff can register and link patient records, while clinical records and private documents retain their role-scoped write rules.

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

## Edge Function hardening

Set `ALLOWED_ORIGINS` to a comma-separated exact-origin list for `create-staff` and `create-patient-portal` (scheme, host, and port; no paths). These functions reject browser origins outside the list. Rate limiting is backed by the service-only `consume_edge_rate_limit` RPC. For authenticated calls it increments separate user and hashed-IP buckets and allows a request only while both are below the limit; unauthenticated monitoring and webhook buckets use IP only. Apply migration `20261116000050_edge_rate_limit_scopes.sql` before deploying the expanded monitoring and notification rate limits. The public monitoring health result is cached for 15 seconds; client-reported telemetry is untrusted and kept separate from server-generated event counters. Set `MEDICORE_ENVIRONMENT` to an allowed environment name for server telemetry; its default is `production`. `integration-dispatch` and `notification-dispatch` process at most five provider calls concurrently and use constant-time bearer comparison. For each webhook, send `x-provider-timestamp` as a Unix timestamp in seconds and sign the exact request bytes as `HMAC-SHA256(secret, timestamp + "." + raw_body)`; the timestamp must be within five minutes. Existing `event_id` inbox deduplication remains enabled.

## Coded terminology

Migration `20261112000038_coded_terminology_foundation.sql` registers the four terminology systems without bundling clinical concept codes. After applying it to the intended environment, import only a licensed official export supplied by your organization with `node scripts/load-terminology.mjs '<system>' '<file.csv-or-tsv>'`. Keep the service-role key in a protected shell environment and follow [the terminology import guide](../docs/clinical/coded-terminology.md) for accepted columns, preferred-term exports, source metadata, and licensing notes. Review the Laboratory module's uncoded-entry report as concepts are loaded; historical free text is not automatically mapped.

## Critical result delivery

Apply `20261112000043_critical_results_human_escalation.sql` and `20261116000052_critical_result_external_notifications.sql` through `supabase db push` against staging first. The migration creates no reference ranges; load only institution-approved ranges linked to already loaded test concepts. Critical, urgent, and routine acknowledgement deadlines default to 30 minutes, 4 hours, and 24 hours. Assign active profile IDs for the department lead, on-call, and medical director rows in `result_escalation_ladder`; the responsible clinician is resolved from each result, with an active Super Admin fallback for unassigned results. Keep each row's order and `after_minutes` aligned with the local escalation policy.

Deploy `notification-dispatch` and set `MEDICORE_NOTIFICATION_CONNECTOR_JSON` to a provider-neutral connector configuration such as `{"endpoint":"https://messaging-gateway.example.invalid/send","tokenEnv":"MESSAGING_GATEWAY_TOKEN"}`. Set the named token using `supabase secrets set MESSAGING_GATEWAY_TOKEN=...`. The connector receives `{ "channel", "recipient", "template", "payload" }` plus an `Idempotency-Key`; it should return a 2xx response only after accepting the message. The function processes no more than five messages concurrently and retries failed deliveries. No real SMS/email provider is configured until the facility sets one up. See [critical result notifications](../docs/deployment/critical-result-notifications.md) for the external scheduler example and PHI-minimization rationale. The pg_cron escalation job is registered automatically only when `pg_cron` is already installed; otherwise use the documented external schedule.

Critical result acknowledgements require the responsible clinician to record the communication method and read-back confirmation/details. The same fields and escalation ladder apply to finalized radiology findings; an assigned radiologist marks `critical_finding` when finalizing the report.

### Diagnosis coding and chart deficiencies

Migration `20261116000066_diagnosis_coding_chart_deficiencies.sql` grants facility-scoped `coding.read`, `coding.manage`, and `chart.audit.manage` permissions to records officers. The discharged encounter worklist is `discharged_encounter_coding_worklist`; diagnosis assignment calls `assign_encounter_diagnosis(...)` and only accepts an active concept already present in `public.concepts`. It stores the `public.code_systems.version` value with the assignment. Import and license terminology releases through the existing terminology loading process before coding; this workflow adds no diagnosis codes. Coding completeness and chart deficiency compliance are available from `coding_completeness_by_department` and `chart_deficiency_compliance_by_department`. Clinicians answer their own coding queries and resolve deficiencies assigned to them. The pgTAP contract is `supabase/tests/diagnosis_coding_chart_deficiencies.test.sql`.

Migration `20261116000067_release_information_disclosure_workflow.sql` extends the existing `disclosure_register` and `data_subject_requests` privacy records. Records Officers intake requests, document identity and authorization verification, approve releases, and record redactions and actual disclosure details. Sensitive scope requires approval by two different Records Officers. Patient access request deadlines are unset until `configure_data_subject_deadline(...)` is used to enter a counsel-approved day count and basis; no legal response period is assumed by the migration. pgTAP coverage is in `supabase/tests/release_information_disclosure_workflow.test.sql`.

Migration `20261116000068_retention_holds_disposal.sql` versions facility-scoped retention schedules. A schedule has no effective duration until staff configure and approve a period with its legal basis. `request_retention_action(...)` checks the approved schedule and elapsed retention interval. Legal holds block requests, approvals, and execution. Disposal requires two distinct approvers and writes an immutable certificate. The disposal path seals and retains source rows to preserve clinical and linked-record integrity; it does not issue direct deletes. Clinical hard-delete triggers remain in force. pgTAP coverage is in `supabase/tests/retention_holds_disposal.test.sql`.
