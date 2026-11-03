# HIM functionality gap analysis

This is a repository-level review of the HIM prompt against the current implementation. “Implemented” means a code/schema path exists; it does not claim production deployment or operational validation. No production data was created or altered during this work.

## Already implemented

| Function | Existing implementation |
|---|---|
| Patient registry and demographic chart | Existing `patients` table and Patients module; facility scope is enforced by migration 29. |
| Patient identity history and emergency merge | `merge_unidentified_patient(...)` preserves temporary identity history and requires a documented reason. |
| Patient longitudinal chart index | Records screen shows demographics, journey, pending tasks, allergies, conditions, medication orders, consultations, and documents without duplicating clinical source data. |
| Patient record access logging | Records screen inserts `patient_access_logs` before opening a chart or secure document URL. |
| Document storage and signed links | Private document storage workflow, classification metadata, and scoped access exist. |
| Referrals, family-card links, appointment coordination, portal inbox | Existing workflows are integrated into Records. |
| Role, facility, and department authorization | Existing profile roles, organization membership, permission catalog, patient facility scope, and restrictive RLS policies. |

## Implemented but incomplete or requiring improvement

| Function | Gap / status after this change |
|---|---|
| HIM navigation/dashboard | Records now shows database-side, facility-scoped patient and physical-file KPI aggregates. A comprehensive date-filtered operational dashboard (visits, admissions, deaths, births, disease trends, completeness, and departmental performance) is still missing. |
| Patient duplicate resolution | Duplicate warning and emergency identity merge exist; a general audited duplicate review/merge workflow needs a separate governance review. |
| Medical record files | Migration 30 adds one facility-bound physical file index per patient with generated identifier, status, custodian, location field, and retrieval/return timestamps. UI can request and track movement; location/classification administration, barcode scanning, file inventory reconciliation, archiving, and digitisation are not yet surfaced. |
| File movement | Migration 30 provides transactional request, release, reject, return, missing, investigation, and located transitions; event history is append-only. Expected-return overdue is derived in the UI. Reminder delivery, escalation scheduling, role-specific approval tiers, and physical recipient identity verification remain unimplemented. |
| Chart audit / documentation deficiencies | No complete HIM audit template, encounter-linked deficiency queue, assigned remediation, or compliance percentage workflow verified. |
| Disease classification / coding | Existing diagnosis fields are not a verified versioned ICD terminology catalog; no code assignment or clinical query workflow added. |
| Release of information | No complete request, authorization, disclosure register, redaction, or patient access-request workflow verified. |
| Retention / archive / legal hold | Clinical hard-delete protections exist; configurable retention schedules, archive workflows, disposal approval, and legal-hold case management are absent. |
| Reports / NHMIS | Generic reports exist, but no validated HIM/statutory aggregate catalog, export disclosure controls, or verified current NHMIS form mappings. |
| Birth/death registration | Some clinical emergency/death workflow fields exist; authoritative birth/death registry, source verification, and dedicated statistics are not a complete HIM module. |

## Missing or deliberately not fabricated

- Verified/versioned ICD-10 (or other classification) source dataset and licensing/version metadata.
- Validated NHMIS reporting definitions and current submission formats.
- Release-of-information request and disclosure accounting.
- Documentation audit templates, findings, corrective actions, and trend reporting.
- Configurable physical filing locations and inventory reconciliation.
- Retention schedule configuration, legal holds, and approved disposal workflow.
- Email/SMS reminder delivery configuration and escalation schedule.
- A broad HIM analytics dashboard for visits, admissions, deaths, births, disease trends, record completeness, and departmental performance.

These were not populated with invented codes, legal requirements, report definitions, fake patient rows, or unsupported compliance claims.

## Major feature status

| Feature | Status | Evidence / limitation |
|---|---|---|
| Existing patient directory and read-only chart | Completed in repository | Reuses the current patient and clinical tables; facility RLS and access logging already exist. Hosted behavior remains environment-specific. |
| HIM physical file register and circulation UI | Partially completed | Frontend, permission-scoped tables/RPCs, state transitions, event history, and synthetic DB test are written. The migration has not been applied. |
| HIM dashboard | Partially completed | Facility-scoped database aggregates cover patient counts and physical-file activity; no custom date range or comprehensive clinical/reporting indicators. |
| Migration 30 staging verification | Blocked by local environment | Local Supabase could not start because Docker/Podman is not installed or available on PATH. No hosted staging connection was configured in this workspace. |
| Audit/deficiency, coding, ROI, retention/archive, NHMIS | Not implemented as complete workflows | Existing adjacent features are listed above; there is no verified end-to-end HIM workflow for these requirements. |

## Added in this implementation

Migration `20261103000030_him_records.sql` (source `supabase/him_records.sql`) adds the records-file register, movement register, append-only movement events, facility-scoped RLS, dedicated HIM permissions, and transactional RPCs. `src/js/modules/records.js` adds the circulation register to the existing HIM page. The rollback is `supabase/rollback/20261103000030_him_records.sql` and requires exporting operational casework before use.

The migration must be tested in staging after migrations 1–29. Staff besides Super Admin need an active membership at the patient's verified facility as well as the Records Officer grants. This repository change does not mean the migration has been applied to any Supabase environment.
