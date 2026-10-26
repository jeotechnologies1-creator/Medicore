# Implementation Roadmap

The project already contains substantial screens and SQL migrations. This roadmap prioritizes verified workflow completion over creating empty module pages.

## Phase 1 — Audit and stabilization (in progress)

- **Implemented:** repository/module/schema inventory; safety and go-live documents; static regression suite; recent clinical workflow and authorization changes.
- **New foundation:** configurable organization units, reporting positions, effective-dated staff memberships, scoped permission data model, and administrator UI.
- **Acceptance:** migration order is deterministic; migrations apply repeatedly where designed; static checks pass; exact staging schema and RLS are recorded.
- **Remaining:** establish schema migration ledger/CI, SQL parser/lint, build/type/lint tooling, staging application, role-by-role policy tests.

## Phase 2 — Identity and organizational foundation (highest priority)

- Build configurable departments, units, service lines, positions, effective-dated staff memberships and scoped permission assignments.
- Complete patient identifiers, contact/next-of-kin, consent, merge review/audit and merge coverage for every patient-linked entity.
- Acceptance: no cross-facility/department access without an explicit grant; merge is reviewed, atomic, reversible by documented recovery and retains provenance.

## Phase 3 — Core outpatient and emergency journey

- Complete appointment capacity/queue, check-in, triage, clinical documentation, signature/addendum, diagnosis catalogue, follow-up and emergency escalation.
- Acceptance: synthetic routine and emergency patient can complete the journey; urgent care has no routine-payment blocker; clinical and financial states remain distinct.

## Phase 4 — Diagnostics, medication, ward and surgery safety

- Complete lab specimen/QC/corrected result/critical acknowledgement; radiology reporting; medication formulary/review/lot dispensing/admin/reconciliation; nursing documentation; ward rounds; surgery/anaesthesia/recovery.
- Acceptance: order-to-result-to-review and prescribe-to-dispense-to-administer tests pass with denied-role tests and audit evidence.

## Phase 5 — Finance and operational controls

- Build charge catalogue, deduplicated charges, invoice/payment/refund/claim reconciliation, accounting ledger, procurement approvals, goods receipt, stock movement ledger, HR credential/roster/offboarding, assets/facilities.
- Acceptance: concurrent stock/payment tests preserve invariants; posted entries are reversed, never overwritten; separation of duties is enforced.

## Phase 6 — Governance, analytics and integrations

- Restrict incident workflows, complete audit/access reporting, privacy-aware aggregates, FHIR/DICOM/LIS/payer integration where selected, portal/telehealth controls.
- Acceptance: integration contract/terminology profiles and retry/reconciliation drills are approved; analytics are scoped and validated.

## Phase 7 — Release readiness

- Penetration and privacy reviews, clinical hazard analysis, restore/downtime drill, accessibility/device validation, training, change control and governance approvals.
- **Release gate:** no clinical production use until migration, security, safety, operational and jurisdiction-specific reviews are signed off by accountable parties.

## Dependencies and blockers

- Staging Supabase project and synthetic data are needed to validate SQL and RLS.
- Hospital leadership must confirm actual organogram, facility/department scope, roles, tariffs, formularies, terminology and clinical policies.
- External integrations need vendor credentials and interface specifications.
- Local clinical, privacy and legal owners must approve clinical forms, retention, consent and applicable regulatory obligations.
