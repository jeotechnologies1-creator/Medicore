# Repository Audit

**Audited:** 2026-10-26. **Scope:** checked tracked repository files, SQL migration definitions, entry points, role/navigation code, package scripts and existing operational documentation. The target Supabase project, actual data, environment values, runtime logs and deployed Edge Functions were not accessible; no secrets were read or copied.

## 1. Current architecture

- Browser-loaded React/JSX application with ordered classic scripts and Babel in `index.html`; `src/app.js` composes screens.
- Supabase Auth, Postgres/PostgREST, Storage, SQL RPCs/triggers and two Edge Functions form the backend. Feature screens often call Supabase directly.
- No separate API server, worker, durable outbox or scheduled job implementation is included. SQL docs instruct operators to configure overdue-result escalation externally.
- No package build/lint/typecheck scripts or dependency manifest for a bundler. Test script runs Node static regression assertions.

## 2. Existing module inventory

The application wires dashboard, patient records, HIM, appointments, consultations, vitals, clinical workflows/safety, laboratory, radiology, pharmacy, billing, insurance, payments, admissions, surgeries, operations, procurement, inventory, referrals/care coordination, workforce/HR, reports, audit, compliance, settings, medical offices, documents and patient portal. See [module-inventory.md](module-inventory.md) for purpose, owner, status and gaps.

## 3. Database inventory

Core tables include profiles, patients, appointments, encounters, vitals, consultations, diagnoses/allergies/conditions, care plans/tasks/consents/alerts, lab/radiology orders, prescriptions/medication orders/administrations, admissions/wards/beds/surgeries, inventory, billing/payments/claims/insurance memberships, documents/messages, facilities/offices, audit/access logs, family cards/referrals, and quality acknowledgements. Full categorized inventory and relationships are in [schema-map.md](../database/schema-map.md). This is inferred from SQL files, not the deployed catalog.

## 4. Functionality to preserve

- Supabase-backed patient/appointment/clinical/diagnostic/pharmacy/finance records; stable UUID patient references.
- Role-based navigation and database policy model; private patient documents and portal identity separation.
- Atomic pharmacy dispensing and payment review operations.
- Encounter-linked emergency/BID intake, unidentified emergency identity, audit history, admission bed queue, surgery review and patient-journey history.
- Existing reports, staff provisioning, portal, and settings features pending regression tests.

## 5. Broken or incomplete areas

- No testable build/lint/type pipeline and no browser integration suite.
- Module implementations vary in completeness; navigation existence is not workflow completion. See module inventory.
- Configurable departments, units, reporting lines and effective-dated membership are not modeled as a full organogram.
- Appointments lack verified capacity conflict/wait-time/reminder/no-show coverage.
- Clinical note signing/addenda, diagnosis catalogue, follow-up controls, emergency resuscitation/escalation, full nursing workflows, maternity, blood bank and anaesthesia are absent or incomplete.
- Lab QC/corrected history/critical notification delivery and radiology PACS/DICOM are incomplete/unverified.
- Accounting ledger, refunds, full payer integration, procurement stock ledger, credentialed HR, incident investigation and release-of-information are incomplete.
- FHIR export is not a validated FHIR endpoint; no external vendor integration was verified.

## 6. Security and data-integrity risks

- Effective security depends on exact migration order and live RLS. Historical migrations establish broad authenticated policies before later hardening; confirm final policy state for every exposed object.
- Many SQL scripts are not clearly rerunnable. Errors from existing policies/functions demonstrate the need for idempotent migration checks and staging replay.
- Authorization is role-centric and lacks complete resource/action/facility/department scope assignments.
- Patient merge needs continuous coverage as patient-linked tables are added; audit and relationship integrity require staging verification.
- Cross-row workflows need RPC idempotency and concurrency tests. Notification delivery cannot be assumed from a database event row.
- Backup, restore, encryption configuration, monitoring, retention, MFA, incident response and downtime operations are deployment-specific and unverified.

## 7. Proposed target architecture

Keep the current stack. Establish shared organization/identity, patient/encounter, service-order/result, medication, revenue and audit domains; use narrow transactional RPCs for multi-row state changes; use RLS for every exposed relation; introduce typed service boundaries and generated schema contracts incrementally; add durable outbox only for integrations that need asynchronous retry. Details: [digital-hospital-architecture.md](digital-hospital-architecture.md).

## 8. Ordered implementation plan

1. Stabilize migration repeatability, staging and SQL/RLS tests.
2. Complete patient identity, configurable organization and scoped permissions.
3. Complete appointment, queue, OPD, emergency and clinical note lifecycle.
4. Finish lab/radiology results, medication/nursing, inpatient and surgery safety.
5. Complete finance, inventory/procurement, HR and operations controls.
6. Add governance analytics and selected standards-based integrations.
7. Run security, clinical, privacy, accessibility, backup and downtime release gates.

See [implementation-roadmap.md](../implementation/implementation-roadmap.md) for acceptance criteria and dependencies.

## 9. Dependencies and migration risks

- Requires a staging Supabase project with synthetic data and exact migration history.
- Preserve production records; do not reset or drop tables. Snapshot, inspect legacy rows, test `NOT VALID` constraints, and agree a recovery method before rollout.
- Validate newer migration order in `README.md`; role authorization must precede hospital/workflow completion policies.
- Hospital owners must confirm organizational chart, responsibilities, service scope, clinical forms, tariffs, formularies and terminology.
- External LIS/PACS/payer/payment/messaging integration requires vendor contracts and interface specifications.
- Qualified clinical, privacy, security and legal owners must approve real-world use in the deployment jurisdiction.

## Verification performed

- `npm test`: passed (static regression suite).
- `git diff --check`: passed.
- No live DB migration, SQL lint, browser E2E, production configuration, or security penetration test was performed.
