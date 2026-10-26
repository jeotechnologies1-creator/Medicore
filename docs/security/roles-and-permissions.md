# Roles and Permissions

**Current implementation: role-oriented navigation and SQL role checks exist. Fine-grained resource/action and department-scoped assignments are planned.** Frontend hiding is not authorization.

## Current role set observed

`super_admin`, `doctor`, `specialist`, `surgeon`, `nurse`, `theatre_staff`, `receptionist`, `records_officer`, `pharmacist`, `laboratory_scientist`, `radiographer`, `accountant`, and `patient` (with legacy enum compatibility migration). Exact accepted values depend on applying migrations in order.

## Proposed permission matrix (summary)

| Domain/action | HIM/reception | Clinician | Nurse | Lab/radiology | Pharmacy | Finance | IT/admin | Patient |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Patient identity create/update | scoped | read | scoped | minimum necessary | minimum necessary | billing minimum | account metadata only | own demographics request |
| Encounter create | initial arrival | yes | scoped | no | no | no | no | request only |
| Clinical note/sign/amend | no | assigned care | nursing notes | no | no | no | no | no |
| Order create | no | yes | permitted nursing protocols | service-specific | no | no | no | no |
| Result enter/validate | no | authorized review | no | service-specific | no | no | no | no |
| Prescribe/dispense/administer | no | prescribe | administer | no | dispense | no | no | view approved only |
| Bed assign/admission | no | request/discharge | allocate/transfer by policy | no | no | no | no | no |
| Invoice/payment/refund | appointment/receipt scope | no | no | no | no | separate record/approve | no | own account view |
| HR/user/role management | no | no | no | no | no | no | explicitly assigned | no |
| Audit/export | HIM release role | clinical purpose | clinical purpose | service purpose | service purpose | finance purpose | audit grant | own portal data |

The matrix is a target for implementation, not a statement of deployed policy. Use explicit actions such as `patient.merge`, `result.validate`, `bed.assign`, `refund.approve`, `staff.manage`, and `audit.read`; scope them by facility, department, assignment, and purpose where required.

## Sensitive controls

- Separate payment entry from approval and refund approval from ordinary payment recording.
- Require clinical author identity and assignment for signing or amending a note.
- Allow HIM/reception only initial encounter registration; preserve clinician ownership of clinical transitions.
- Keep patient access policies patient-specific; test direct REST calls and changed identifiers.
- Offboarding must disable Auth and revoke active profile/department assignments promptly.
- Do not grant global data access solely because a role is named administrator. Review super-admin scope explicitly.

## Verification still required

Apply the final authorization/workflow migrations in staging. For each role, test permitted and denied SELECT/INSERT/UPDATE/DELETE, RPC execution, Storage upload/download, patient A vs patient B, inactive profile behavior, self-role escalation, and direct URL/API manipulation. No such deployed adversarial matrix was run in this repository audit.
