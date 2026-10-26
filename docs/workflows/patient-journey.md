# Patient Journey

This describes current capability and target handoffs. It is a workflow map, not evidence that every transition has passed integration testing.

## Routine outpatient (current: partial)

1. Reception/HIM searches for a patient; patient UUID is the internal key. The UI warns of likely duplicates, but staff must review; it must not auto-merge.
2. Register a patient if appropriate, then book/check in an appointment. Provider capacity and wait-time controls remain incomplete.
3. Open an encounter. HIM/reception registration is limited to the initial arrived state by database policy. The clinician owns clinical assessment and closure.
4. Record complaint, observations, allergy/problem context, examination, assessment, diagnosis and plan. Current notes include structured fields but do not provide full terminology or authenticated signing/addenda.
5. Create encounter-linked lab/imaging/prescription/admission/surgery orders as applicable. Do not require every patient to visit every department.
6. Laboratory records specimen collection and preliminary results; authorized verification makes a result final. Radiology has a report workflow. QC, correction history, routing and notification acknowledgement require validation.
7. Clinician reviews findings and records a decision. Existing result acknowledgement support needs a deployed role and critical-result integration test.
8. Billing/payment remain separate from clinical encounter status. Do not infer discharge from payment.
9. Pharmacy dispensing is distinct from medication administration. Nursing records administration separately.
10. Close the encounter only through the clinician workflow. Follow-up/referral and patient instructions should be recorded; not all steps are enforced as closure prerequisites.

## Emergency and unidentified identity (current: partial)

- Emergency registration captures arrival context/priority; routine billing is not a prerequisite in the UI workflow.
- Unknown identity uses a temporary patient and encounter RPC. HIM may later merge after review using an audited merge RPC; this must be tested against all patient-linked tables in staging.
- BID/BOD registration is reported status only. An authorized clinician records assessment and disposition; registration staff cannot confirm death.
- Triage, resuscitation charting, timed escalation, transfer acceptance and final emergency outcome need completion.

## Inpatient (current: partial)

1. Clinician creates an admission request with encounter, diagnosis, priority, and requested ward.
2. Ward staff allocate an available bed through a row-locked RPC; bed/admission writes are not granted directly to authenticated clients.
3. Ward care, rounds, observations, administration, intake/output and transfer are recorded in their respective workflows; several are not complete.
4. Clinician authorizes discharge or transfer with summary/instructions; RPC releases the bed and updates occupancy transactionally.
5. Follow-up, reconciliation and final operational reconciliation are required; not all are enforced.

## Surgery (current: partial)

Request → clinical/theatre review → schedule with required consent/pre-op details → in-progress → completed with operative/post-op documentation. Rejection/defer requires a reason. Anaesthesia record, safety checklist, recovery observations, device/consumable traceability, and theatre utilization remain planned.

## Billing, claims and follow-up (current: partial)

Order/service → tariff/charge → invoice → payment submission/review → claim and remittance reconciliation. Existing billing, payment approvals, claims and manual insurance eligibility screens do not constitute a complete accounting or payer integration. A service must not be double charged when its source module and billing module both see the order.

## Downtime and reconciliation

Use the facility-approved paper/downtime identifier and recovery process described in `docs/deployment/operations-runbook.md`. Do not create local browser clinical records as a fallback source of truth.
