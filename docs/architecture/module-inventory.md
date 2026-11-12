# Module Inventory

Status labels: **Implemented** means a repository UI/data path exists; it does not imply full workflow acceptance. **Partial** means an important subset exists. **Planned** means no complete feature was verified. **Unverified** means runtime/RLS/integration behavior needs a deployed test.

| Module / route | Current purpose and owner | Status | Main dependencies / gaps |
|---|---|---|---|
| Dashboard | Role-oriented KPIs and shortcuts; executive/operations | Partial | Migration 46 adds facility/date-scoped aggregate RPCs and screen-scoped loading; runtime performance and full KPI coverage remain unverified. |
| Patients | Registration, search, demographics, chart; reception/clinical | Partial | Migrations 46-47 add server search, exact duplicate prevention, near-match review, and reversible merge history; apply migrations and validate identity decisions in staging. |
| HIM / Records | Patient chart index, family cards, referrals, document/chart access, physical-file circulation; HIM | Partial | Migration 30 adds facility-scoped file requests, handovers, returns, missing-file investigation, and immutable movement events. No comprehensive dashboard, coding catalog, ROI approvals, audit/deficiency workflow, retention schedule, archive, or validated HIM analytics. |
| Appointments | Schedule, check-in/status, patient requests; reception/clinicians | Partial | Provider availability, wait-time/queue tracking, reminders, no-show and capacity conflict rules need completion. |
| Consultations | Clinical note/diagnosis/plan and prescribing; clinician | Partial | Free-text fields and encounter linking exist; signature/addendum history, terminology, and structured examination are incomplete. |
| Clinical workflows | Emergency/routine/BID registration, immunization, medication administration; HIM/reception/clinical | Partial | No complete resuscitation, escalation, transfer/outcome, or maternity workflows. |
| Vitals / Clinical safety | Observations, alerts, allergy/condition/care-plan data; nursing/clinical | Partial | Nursing assessment/handover/interventions and validated escalation are incomplete. |
| Laboratory | Orders, specimen collection, preliminary/final result workflow; lab | Partial | Result verification and critical-result acknowledgement/escalation persistence exist; QC, accession/labels, corrected-result history, routing and notification delivery require verification. |
| Radiology | Imaging orders and report workflow; radiology | Partial | No PACS/DICOM/image retrieval integration verified; critical finding acknowledgement needs end-to-end validation. |
| Pharmacy | Prescriptions, atomic dispensing, medication stock; pharmacy | Partial | Lot-aware dispense support exists in SQL; formulary, barcode, controlled-medicine governance, reconciliation and adverse-event reporting incomplete. |
| Billing / Payments | Invoices, idempotent payment submission/posting, separate refund request/review, claims, insurance membership; finance | Partial | Internal balanced journal posting and ledger review exist. No itemized charge catalogue, credit notes, AP/AR close, or verified vendor-specific payment/payer exchange. Eligibility is manual. |
| Admissions / Ward | Admission request, bed allocation, transfer/discharge; clinician/nursing | Partial | Transactional bed operations exist; daily rounds, intake/output, nursing plans and complete discharge planning incomplete. |
| Surgery / Theatre | Request/review/scheduling/status; surgeon/theatre | Partial | Consent/pre-op/op/post-op fields and state guard exist; anaesthesia, checklist, recovery, consumables and utilisation reporting incomplete. |
| Operations | Patient flow, capacity, logistics screens; administrator | Partial | Facilities, transport, cleaning, utilities and work-order services are not complete. |
| Procurement | Suppliers, purchase orders and spend view; procurement | Partial | No verified purchase approval, GRN, stock ledger, concurrency, returns, supplier evaluation, or AP integration. |
| Inventory | Pharmacy inventory; pharmacy/store | Partial | Broader stores/locations and auditable stock movement workflow are incomplete. |
| Care coordination / Referrals | Referrals, follow-ups, handoffs; clinical/HIM | Partial | Migration 48 adds clinical referral letters and audited printing; external referral lifecycle and handoff confirmation require validation. |
| Workforce / HR | Staff profiles, attendance/payroll/recruitment tabs; HR | Partial | Credentials, licensure expiry, schedules, leave and payroll controls not validated as complete. |
| Reports | Operational reporting screens; authorized management | Partial | No database-side aggregate catalogue, privacy review, comprehensive export controls, or validated statutory reports. |
| Audit / Compliance | Audit log and compliance exports; security/admin | Partial | Migration 44 adds an append-only hash chain and verification RPC; quarterly access review and 60-day dormant-account listing/suspension are implemented in migration 49; live policy, backup and retention validation remains. |
| Settings / System | Application configuration, role matrix, staff provisioning; IT/admin | Partial | Migration 49 adds audited downtime read-only mode, database write guards, alert counters, safe client telemetry and a health Edge Function; production monitor/secrets/alert delivery are not configured here. |
| Backup / Recovery | Database and Storage export, restore checks; platform operations | Partial | Daily logical database plus Storage-object backup runner and restore verification SQL are present; PITR, off-site encryption/retention, schedule, RTO/RPO approval and restore drill require deployment evidence. |
| Patient portal | Patient billing, appointments, results, prescriptions, messages; patient | Partial | RLS patterns exist; URL/API isolation and approved document access need adversarial testing. |
| Documents | Upload and signed access to patient documents; HIM/care team | Partial | Classification/retention/release request lifecycle incomplete. |
| Medical offices | Clinic offices and staff assignment; operations | Partial | Not a full configurable department/service-line hierarchy. |
| Organization structure | Configurable org units, reporting positions, staff memberships; hospital administration | Implemented (initial foundation) | Migration/UI added; scoped authorization across legacy clinical tables and staging verification remain. |
| Maternity / Newborn | No dedicated complete module found | Planned | Requires privacy-scoped pregnancy, labour, delivery, newborn, outcomes and follow-up model. |
| Blood bank / transfusion | No complete module found | Planned | Requires compatibility, issue/return, reaction, inventory and traceability controls. |
| Finance / General ledger | Internal ledger and billing posting; finance | Partial | Chart of accounts, immutable balanced journals and payment/claim event posting exist. Period close, full AP/AR, and bank/provider reconciliation workflows remain incomplete. |
| Facilities / Assets | Partial references in operations | Planned | Asset register, maintenance schedule, work orders and utilities need implementation. |
| Quality / Infection control | Alerts/tasks and compliance surfaces | Partial | Incident case confidentiality, CAPA, surveillance and governed closure workflows absent/incomplete. |
| Telemedicine / Integrations | No verified provider integrations | Planned | Consent, secure session vendor, interface contracts and downtime behavior required. |

Routes are wired in `src/app.js`; visible navigation and access matrices are in `src/js/layout.js`, `src/js/auth.js`, and `src/js/modules/system.js`. Alias routes (for example `ward`, `vitals`, `results`) reuse owning modules and are not independent data domains.
