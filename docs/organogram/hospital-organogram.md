# Hospital Organogram

**Status: target/configuration model documented; configurable hierarchy not yet implemented.** The current database has facilities, medical offices, wards, and beds. It does not yet provide a complete department/unit/job-position/reporting graph. Do not infer that the proposed roles below exist in every facility.

## Recommended hierarchy

```text
Governing Board / Governing Authority
└── Chief Executive / Medical Director
    ├── Hospital Operations and Administration
    │   ├── Human Resources and Staff Credentialing
    │   ├── Procurement, Stores, Facilities, Transport, Security, Support Services
    │   └── Legal and Compliance Support
    ├── Medical Services
    │   ├── General OPD and Specialist Clinics
    │   ├── Emergency and Accident Services
    │   ├── Medicine, Surgery, Paediatrics, O&G, and other configured specialties
    │   ├── Inpatient Wards, ICU/HDU, Theatre, Anaesthesia, Recovery
    │   ├── Maternity and Newborn Services (where provided)
    │   └── Referral, Rehabilitation, and Palliative Services (where provided)
    ├── Nursing Services
    │   ├── OPD, Emergency, Ward, Theatre, Critical Care, Maternity, Neonatal
    │   └── Infection Prevention, Education, Supervision
    ├── Diagnostics and Therapeutics
    │   ├── Laboratory, Blood Bank, Radiology, Pharmacy
    │   └── Physiotherapy, Occupational Therapy, Nutrition, configured allied health
    ├── Finance and Revenue
    │   ├── Billing, Cash Office, AR/AP, Ledger, Budget, Insurance, Reconciliation
    │   └── Financial Reporting and Internal Controls
    ├── Health Information, Quality, Safety, and Research
    │   ├── HIM, Coding, Documentation, Release, Retention, Statistics
    │   ├── Clinical Audit, Patient Safety, Incident Review, Infection Surveillance
    │   └── Research Administration and Ethics (where provided)
    └── Digital Health and IT
        ├── Identity and Application Administration
        ├── Infrastructure, Cybersecurity, Support, Integrations, Monitoring
        └── Data Governance, Backup, Recovery, and Training
```

## Configuration rules

- Treat the chart as a template. A facility can rename, add, deactivate, or reorder departments, units, job titles, and service lines.
- Use stable UUID identifiers and effective dates. Preserve historical membership and reporting relationships when staff transfer.
- A staff profile's job title, department membership, and application role are separate facts. Membership alone must not grant clinical access.
- Support multiple department assignments and an explicit primary assignment. Record who changed reporting lines and when.
- Use hospital/facility scope before adding department scope to authorization. A UI filter is not an access boundary.
- Assign executive/audit read access narrowly, with no implied permission to modify clinical or financial records.

## Proposed entity relationships

`hospital → facility → department → unit/service → location (ward/room/bed)`; `job_position → reporting_position`; `staff_profile ↔ department_membership`; `department_membership → facility`; each membership carries role/title, start/end dates, status, and approving actor. A separate authorization assignment links a profile to permission bundles and scope.

**Current implementation:** facilities (`safe_core_multibranch.sql`), medical offices and office staff, wards and beds, and a fixed application role set. **Remaining:** configurable department/unit hierarchy, positions/reporting graph, effective-dated memberships, scoped permission assignments, and admin UI.
