# Department Workflows and Handoffs

| Department/service | Receives | Owns and records | Hands off to | Current gaps |
|---|---|---|---|---|
| Reception / HIM | Patient, appointment, referral | Identity search/registration, encounter arrival, family card, indexing | Triage/clinic; HIM correction queue | Queue/arrival timestamps, approved release, coding and retention. |
| OPD / specialist clinic | Checked-in encounter | Clinician history, exam, assessment, plan, orders and closure | Lab, radiology, pharmacy, ward, referral | Signature/addendum, terminology, follow-up enforcement. |
| Emergency | Walk-in/ambulance/transfer | Triage, priority, emergency encounter and disposition | Critical care, diagnostic services, ward, transfer provider | Resuscitation, escalation, transfer acceptance and time-to-care reports. |
| Nursing / ward | Active encounter/admission | Observations, medication administration, nursing plan/handover | Treating clinician, pharmacy, next shift | Complete nursing assessment, wound care, intake/output, escalation. |
| Laboratory | Authorized lab request/specimen | Accession, collection, processing, QC, preliminary/final result | Responsible clinician; critical result escalation | Barcode labels, QC, amended result versioning, delivery/acknowledgement. |
| Radiology | Imaging request | Scheduling, modality, report validation, critical communication | Ordering clinician | PACS/DICOM, image store, report correction and acknowledgement. |
| Pharmacy | Prescription | Clinical review, dispense, lot/expiry movement, counselling | Ward/nursing for administration; prescriber for clarification | Formulary/interactions, explicit lot/item transaction, controlled drugs, ADR. |
| Theatre / surgery | Surgical request and admission | Review, schedule, consent, checklist, anaesthesia, operation, recovery | Ward/ICU and follow-up clinician | Anaesthesia and recovery data, consumable traceability, staffed theatre calendar. |
| Finance / cash office | Chargeable service and payer | Tariff, invoice, receipt, approval and reconciliation | Patient/insurer and finance ledger | Complete ledger, refunds, credit notes, remittance and separation of duties. |
| Procurement / stores | Requisition and stock need | Approvals, PO, receipt, location/lot movement | Department and accounts payable | GRN, approval chain, stock ledger, concurrency and vendor controls. |
| HR / workforce | Staff/position request | Credential, employment, assignment, shift, leave and payroll | Identity admin for account changes | Credential verification, scoped memberships, payroll segregation and offboarding. |
| Quality / safety | Incident, complaint, alert | Restricted case, review, corrective action and closure | Governance/department owner | Dedicated confidential case model, role restriction, deadlines and evidence. |
| Patient portal | Authenticated patient request | Own appointments/results/billing/messages | Assigned clinic/finance triage queue | Explicit queue SLA, portal isolation testing, telehealth. |
| IT / system admin | Change/support request | Auth, configuration, monitoring, backup and incident response | Department owners/security governance | Scoped department authorization, monitoring and proven recovery. |

Each handoff should include a stable patient UUID, encounter or source-order ID, assigned owner/queue, timestamp, state, and audit actor. Failed notifications should remain visible as queue work rather than disappear. Do not include unnecessary clinical detail in general-purpose notifications.
