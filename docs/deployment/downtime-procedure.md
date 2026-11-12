# Clinical downtime procedure

## Declaration and operating mode

The incident commander or delegated clinical lead declares downtime, records start time/facility/impact in the downtime log, and notifies the affected departments. A Super Admin can enable **downtime read-only mode** from the application banner. The database setting `downtime_read_only_mode` blocks inserts, updates, and deletes on the listed patient, staff, clinical, operational, settings, and Storage object tables; audit, monitoring, access logging, outbound delivery bookkeeping, and downtime-setting writes remain available. The banner refreshes every 30 seconds. Apply the migration and test the control before relying on it. Review the trigger list when adding database tables or Storage write paths.

This mode is not a substitute for infrastructure isolation or provider-level incident controls. Verify the covered table list against every newly added workflow before release.

## Paper forms to keep available

- Patient identity/registration and temporary identifier log.
- Triage, emergency assessment, encounter/consultation, and clinical progress notes.
- Vitals, nursing observation, medication administration, allergy, and medication reconciliation.
- Medication prescription, dispensing, controlled-drug issue, and stock movement.
- Laboratory order, specimen label/accession, result, critical-result read-back, and correction.
- Radiology order, imaging report, and critical-result read-back.
- Admission, bed movement, transfer, discharge summary, and patient instructions.
- Procedure/surgery consent, checklist, operative note, and recovery record.
- Billing/invoice, receipt, refund request, and cash reconciliation.
- Referral/handoff, consent, and external communication.
- downtime event log, reconciliation queue, and department sign-off sheet.

Departments maintain locally approved versions with version/date and controlled storage. Do not improvise medication or critical-result forms.

## Downtime identifiers and records

At declaration, the records lead issues sequential identifiers in this form: `DT-<facility-code>-<YYYYMMDD>-<sequence>`, for example `DT-ABC-20261112-0001`. Record the identifier on every form and cross-reference any known patient MRN/record number. For an unidentified patient, use a temporary `TMP-<facility-code>-<YYYYMMDD>-<sequence>` identifier, apply the facility's approved wristband/label, and do not invent or reuse an MRN. The identity officer reconciles temporary identifiers to verified patient records after restoration.

Maintain a reconciliation queue with downtime ID, patient/MRN or temporary ID, form type, department, author, event time, entered-by, entry time, independent checker, status, discrepancy, and both signatures. Enter records in chronological order. Link the scanned paper form to the resulting EMR record under approved access controls. Preserve the original paper record under the facility retention schedule.

## Recovery and sign-off

1. Technical lead confirms service health and informs the incident commander; keep read-only mode on while recovery validation is underway.
2. Clinical lead authorizes return to normal operation after test logins, patient search, medication lists, orders/results, and critical acknowledgement workflows pass.
3. Records lead controls the reconciliation queue, resolves identity conflicts before entry, and assigns duplicate checks.
4. Departments enter their paper records, mark each queue item entered, and have an independent checker compare the EMR entry against the signed source form.
5. Reconcile medication stock, controlled-drug counts, lab/radiology queues, appointments, cash, and external messages. Record every discrepancy and escalation.
6. The author signs the source form; the entering staff member and independent checker sign the queue entry; department lead signs reconciliation complete. Never backdate the EMR authoring timestamp; preserve the original clinical event time in the note.
7. Incident commander records end time and closure approval. Security/privacy lead reviews access/audit anomalies and retained forms.

Read-only mode may be disabled only after clinical and technical approval and the initial reconciliation controls are staffed. Continue reconciliation until every queue item has a disposition and required sign-offs.
