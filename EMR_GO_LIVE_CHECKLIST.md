# MediCore EMR go-live checklist

This application is a clinical-record system. Do not describe it as certified, compliant, or production-ready until the controls below have been implemented, tested, and approved by the responsible clinical, privacy, and security leaders.

## Interoperability and clinical data

- Map the internal record model to [HL7 FHIR](https://hl7.org/fhir/overview.html) resources before building integrations: Patient, Practitioner, Encounter, Appointment, Observation, AllergyIntolerance, Condition, MedicationRequest, DiagnosticReport, ServiceRequest, Procedure, DocumentReference, Consent, and AuditEvent.
- Store coded clinical concepts alongside their display names. Use an approved terminology service and licensed code systems as appropriate: ICD-10 for diagnoses, LOINC for laboratory observations, SNOMED CT for clinical concepts, and a local formulary/drug identifier for medications. Do not rely on free text for decision support, reporting, or data exchange.
- Add a documented identifier policy: a facility-scoped medical-record number, duplicate-patient matching/reconciliation workflow, merge history, and staff verification at registration.
- Require an encounter context and author for clinical notes, orders, medication orders, results, and procedures. Preserve the original signed entry; corrections must create an attributed amendment, never overwrite the original clinical content.
- Define result-verification and critical-result escalation workflows, including who may verify/release a result, time limits, acknowledgement, and escalation evidence.
- Validate clinical decision-support rules with named clinical owners. Alerts should be actionable, tracked to acknowledgement/resolution, and reviewed for false-positive burden.

## Safety, privacy, and security

- Complete a risk analysis and risk-management plan covering confidentiality, integrity, and availability of ePHI. The [HIPAA Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) describes administrative, physical, and technical safeguard expectations; applicable Nigerian and other local privacy requirements also need legal review.
- Enforce least-privilege roles with Supabase RLS, MFA for privileged accounts, secure password/session policies, account provisioning and termination controls, and periodic access reviews. Test every role using a non-production account.
- Keep audit data server-generated and immutable. Log reads of patient data as well as create/update/delete activity, and retain enough actor, patient, timestamp, source, and before/after context for investigations.
- Encrypt traffic in transit, use managed encryption at rest, keep service-role secrets only in server-side environments, rotate secrets, and block backups, logs, analytics, and error reporting from exposing PHI.
- Define retention, legal-hold, backup, restore, disaster-recovery, downtime, breach-response, and data-subject-request procedures. Perform a restore test before go-live.
- Obtain and record treatment, privacy, data-sharing, and procedure consent where required. Give patients access only to their own data and ensure portal messages/refills are triaged by a defined workflow.

## Operational readiness

- Apply all Supabase migrations in the order in `README.md`; do not run a synthetic patient seed script in a live environment.
- Create real staff through Supabase Auth and assign roles only through the authorized admin workflow. Confirm no hard-coded staff identifiers are present in the browser code.
- Exercise each role end-to-end in a staging project: registration, appointment, encounter, vital signs, orders/results, prescription/dispense, admission/discharge, billing/payment/claim, documents, portal requests, and audit review.
- Establish clinical governance: named medical director, safety lead, privacy officer, change-control process, user training, support escalation, and release rollback plan.

FHIR is intended for structured, electronic health-information exchange and uses resources as the common exchange building blocks. See the [FHIR overview](https://hl7.org/fhir/overview.html). The HHS guidance is a useful security baseline, but it does not replace advice for the jurisdiction in which MediCore is deployed.
