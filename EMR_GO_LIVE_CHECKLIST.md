# OneMed EMR go-live checklist

This application is a clinical-record system. Repository implementation is not operational evidence. Do not describe it as certified, compliant, or production-ready until controls have been tested in the target environment and approved by responsible clinical, privacy, and security leaders. The [evidence tracker](docs/status/evidence-tracker.md) assigns an owner and records current status for each control; all controls are presently unverified against live Supabase.

## Interoperability and clinical data

- Validate the existing FHIR R4 endpoint and mapping against [HL7 FHIR](https://hl7.org/fhir/overview.html) resources, including Patient, Practitioner, Encounter, Appointment, Observation, AllergyIntolerance, Condition, MedicationRequest, DiagnosticReport, ServiceRequest, Procedure, DocumentReference, Consent, and AuditEvent.
- Store coded clinical concepts alongside their display names. Use an approved terminology service and licensed code systems as appropriate: ICD-10 for diagnoses, LOINC for laboratory observations, SNOMED CT for clinical concepts, and a local formulary/drug identifier for medications. Do not rely on free text for decision support, reporting, or data exchange.
- Add a documented identifier policy: a facility-scoped medical-record number, duplicate-patient matching/reconciliation workflow, merge history, and staff verification at registration.
- Require an encounter context and author for clinical notes, orders, medication orders, results, and procedures. Preserve the original signed entry; corrections must create an attributed amendment, never overwrite the original clinical content.
- Validate result-verification and critical-result escalation workflows, including who may verify/release a result, time limits, acknowledgement, notification delivery, and escalation evidence. Repository workflow code and tests exist; live behavior remains unverified.
- Validate clinical decision-support rules with named clinical owners. Alerts should be actionable, tracked to acknowledgement/resolution, and reviewed for false-positive burden.

## Safety, privacy, and security

- Complete a risk analysis and risk-management plan covering confidentiality, integrity, and availability of ePHI. The [HIPAA Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) describes administrative, physical, and technical safeguard expectations; applicable Nigerian and other local privacy requirements also need legal review.
- Validate least-privilege roles with Supabase RLS, MFA for privileged accounts, secure password/session policies, account provisioning and termination controls, and periodic access reviews. A core RLS matrix exists; extend/execute feature-specific role tests in staging using non-production accounts.
- Keep audit data server-generated and immutable. Log reads of patient data as well as create/update/delete activity, and retain enough actor, patient, timestamp, source, and before/after context for investigations.
- Encrypt traffic in transit, use managed encryption at rest, keep service-role secrets only in server-side environments, rotate secrets, and block backups, logs, analytics, and error reporting from exposing PHI.
- Define retention, legal-hold, backup, restore, disaster-recovery, downtime, breach-response, and data-subject-request procedures. Perform a restore test before go-live.
- Obtain and record treatment, privacy, data-sharing, and procedure consent where required. Give patients access only to their own data and ensure portal messages/refills are triaged by a defined workflow.

## Operational readiness

- Apply all Supabase migrations in the order in `README.md`; do not run a synthetic patient seed script in a live environment.
- [ ] Configure hosted Auth/API settings from [hosted-auth-settings.md](docs/deployment/hosted-auth-settings.md) in staging and production. Run `npm run verify:hosted-config` against each deployed frontend and Supabase project; resolve failures and manually review every item reported as unverifiable before promotion/go-live.
- [ ] Apply `20261116000053_super_admin_continuity.sql`; confirm at least two independently controlled active Super Admin accounts, and complete the facility role/title placeholders in the [break-glass procedure](docs/security/break-glass.md).
- Create real staff through Supabase Auth and assign roles only through the authorized admin workflow. Confirm no hard-coded staff identifiers are present in the browser code.
- Exercise each role end-to-end in a staging project: registration, appointment, encounter, vital signs, orders/results, prescription/dispense, admission/discharge, billing/payment/claim, documents, portal requests, and audit review.
- Establish clinical governance: named medical director, safety lead, privacy officer, change-control process, user training, support escalation, and release rollback plan.

## Operations readiness evidence

The repository now contains a daily logical database/Storage backup runner (`npm run backup:daily`), restore row-count/hash-chain SQL, a PITR and restore-drill procedure, a monitoring/uptime Edge Function, allowlisted client error telemetry, operations alert counters, a downtime read-only database guard/banner, and a 60-day dormant-staff report/suspension function. These are implementation artifacts, not evidence that hosted services are configured or tested.

- [ ] Apply migration `20261112000049_operations_readiness.sql` in staging and production; test downtime read-only guards on every covered workflow/table.
- [ ] Enable Supabase PITR, record recovery retention and recovery points. Confirm daily logical export continues because PITR replaces Supabase's daily backup schedule.
- [ ] Configure `DATABASE_URL`, `BACKUP_DIR`, `SUPABASE_URL`, and server-only service key in the secured runner; schedule daily backups to encrypted off-site storage and alert on failure/staleness.
- [ ] Configure and test monitoring URL, `ALLOWED_ORIGINS`, service-only alert polling, delivery route, thresholds, and on-call ownership. Confirm telemetry contains only allowlisted fields.
- [ ] Approve RTO/RPO values; complete a restore drill including table counts, hash-chain verification, Storage object checks, and sample role logins.
- [ ] Complete a quarterly access review and review the 60-day dormant staff list before optional suspensions.
- [ ] Complete a downtime tabletop exercise, paper-form inventory, identifier reconciliation, and required sign-offs.
- [ ] Record clinical, security/privacy, and technical approvals. Do not mark this checklist complete based on source changes alone.

Historical build or static-check notes are not current release evidence. No tests or live Supabase checks were run for this documentation update. Use the evidence tracker for current status; record results and dates only after the named owner has performed the check in the target environment.

FHIR is intended for structured, electronic health-information exchange and uses resources as the common exchange building blocks. See the [FHIR overview](https://hl7.org/fhir/overview.html). The HHS guidance is a useful security baseline, but it does not replace advice for the jurisdiction in which OneMed is deployed.
