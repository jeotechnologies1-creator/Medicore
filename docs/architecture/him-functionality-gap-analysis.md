# HIM functionality and evidence review

Repository review date: 2026-11-17. **Implemented** means code/schema and a repository test exist; **Partial** means material workflow scope remains; **Planned** means no substantial implementation/test exists. All live Supabase behavior remains **Unverified** until a staging project is exercised. No status in this report certifies deployment or operational readiness.

## Implemented in the repository

| Function | Evidence |
|---|---|
| Patient registry, demographic chart and facility access rules | Patient module; facility-scope policies; `patient_portal_isolation.test.sql`. |
| Duplicate search and controlled identity merge | Migrations `20261116000076` and `20261116000079`; immutable search test and identity workflow coverage. |
| Longitudinal chart index and patient-access logging | Records module; `him_records.test.sql`; `him_dashboard_analytics.test.sql`. |
| Private document storage and audited print/access paths | Document storage scope, privacy audit and release workflow migrations; `release_information_disclosure_workflow.test.sql`. |
| Physical-file register and circulation | `20261103000030_him_records.sql`; `him_records.test.sql`. |
| Diagnosis coding and chart deficiencies | `20261116000066_diagnosis_coding_chart_deficiencies.sql`; `diagnosis_coding_chart_deficiencies.test.sql`. |
| Release-of-information and data-subject request lifecycle | `20261116000067_release_information_disclosure_workflow.sql`; `release_information_disclosure_workflow.test.sql`. |
| Retention schedules, legal holds, approvals and disposal certificates | `20261116000068_retention_holds_disposal.sql`; `retention_holds_disposal.test.sql`. Disposal seals source data; it does not hard-delete the clinical source. |
| Birth/death registration and statutory reporting controls | `20261116000069_birth_death_statutory_reporting.sql`; `birth_death_statutory_reporting.test.sql`. |
| Facility-scoped HIM summary analytics | `20261116000070_him_dashboard_analytics.sql`; `him_dashboard_analytics.test.sql`. |
| Append-only audit and hard-delete safeguards | Audit migrations and `server_audit_privacy.test.sql`, `clinical_hard_delete_lock.test.sql`. |

## Partial or planned scope

| Function | Status | Remaining gap |
|---|---|---|
| HIM operational dashboard | Partial | Current aggregates cover patient and physical-file activity. A complete date-filtered operational dashboard and governed measures still need acceptance. |
| Physical-file inventory | Partial | Circulation and event history exist. Barcode scanning, location administration, inventory reconciliation and digitization operations need completion. |
| Chart audit and deficiency remediation | Partial | Templates, encounter-linked deficiencies and coding queries exist; broad audit coverage, remediation operations and compliance trend measures need validation. |
| Coding catalog | Partial | Diagnosis coding and clinician query workflow exist; terminology release/version governance and licensed catalog updates need a production source and review. |
| Release/disclosure operations | Partial | Request, approval separation and disclosure register paths exist; operational redaction, identity proofing and local authorization policy need validation. |
| Retention and archive operations | Partial | Schedule, holds, dual approval and source-sealing certificate flow exist; configure legally reviewed schedules, facility procedures and live audit evidence. |
| Statutory/NHMIS reporting | Partial | Statutory definitions and suppression controls exist; validated current submission mappings and jurisdictional approval remain outstanding. |
| Maternity/newborn HIM | Planned | No dedicated end-to-end maternal/newborn record and reporting module. |

## Live validation status

No staging/live Supabase project was exercised for this review. Migration application state, hosted RLS behavior, facility membership configuration, real data preflight, statutory reporting, retention schedules and external notification delivery remain **Unverified**. Repository evidence is indexed in the [go-live evidence tracker](../status/evidence-tracker.md); synthetic SQL fixtures use transaction rollback, and no live patient data is included in these tests.
