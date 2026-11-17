# EMR Safety and Reliability Audit

## Current assessment

OneMed has substantial application and database code for registration, appointments, clinical documentation, orders/results, admissions, pharmacy, blood bank, surgery, billing, inventory/procurement, assets, records, reporting, and role-based access. Repository tests cover many of these paths. This is a code-level assessment: no live Supabase project was exercised for this documentation review, and no feature is marked operationally verified. See the [module inventory](docs/architecture/module-inventory.md) and [evidence tracker](docs/status/evidence-tracker.md).

This is not yet appropriate to describe as safer or more complete than established production EHRs. Production EHR quality depends on independently validated clinical workflows, server-enforced authorization, operational downtime processes, traceable data changes, and deployment-specific regulatory assessment.

## Inventory valuation

The Super Admin dashboard now displays **Inventory Value**, defined as:

`sum(max(on-hand quantity, 0) × max(unit price, 0))`

This is the appropriate financial KPI for stock on hand. It is distinct from item count, SKU count, or purchase commitments. It excludes negative quantities and prices from reducing the reported value. The Pharmacy view now uses the same calculation.

## Findings addressed

| Area | Finding | Resolution |
| --- | --- | --- |
| Dashboard | Quality Snapshot referenced an undefined `qualityEntries` value and could blank the application. | Defined the derived quality-task dataset and added an error boundary. |
| Department management | New departments used non-UUID IDs although the database requires UUID primary keys; returned database errors were ignored. | Uses database-generated IDs and surfaces failed create, edit, and delete requests. |
| Inventory reporting | Super Admin had no clear on-hand inventory valuation. | Added a labeled Inventory Value KPI to Dashboard and Pharmacy. |
| Expiry monitoring | Pharmacy counted past-dated items as “expiring soon.” | Counts only valid dates from today through three months ahead. |
| Dispensing | Dispensing did not update stock status after changing quantity and could mark a multi-medication prescription dispensed after processing only its first item. | Added an atomic Supabase dispensing migration that validates every medication, uses the earliest non-expired lot, updates all stock rows, writes an audit event, and marks the prescription dispensed only when the full transaction succeeds. |
| Appointment booking | Concurrent requests could assign one doctor or patient to the same exact date/time slot. | Added migration `20261103000028` with transaction advisory locks and a database trigger that rejects exact-slot conflicts. |
| Patient privacy and facility scope | Patient registry reads and several patient-linked workflows relied on broad role policies, and registration did not set `home_facility_id`. | Added migration `20261103000029` to enforce facility/department scope on patient-linked reads and writes, constrain appointment RPC writes and doctor facility assignment, prevent hard deletes on retained patient workflows, and require registration to select a permitted facility. Legacy patients without a verified facility remain quarantined to the linked patient and Super Admin until explicitly mapped. |
| Feature coverage descriptions | Older module notes treated blood bank/transfusion and asset maintenance as planned, and described HIM coding, release, retention, statutory records and analytics as absent. | Current code and tests include blood bank (`20261116000059`), asset maintenance (`20261116000073`), and the HIM workflows listed in the [HIM gap analysis](docs/architecture/him-functionality-gap-analysis.md). These remain operationally unverified against live Supabase. |

## Operations readiness status (repository review: 2026-11-17)

Implemented in repository, pending deployment and operational evidence:

- Added `scripts/backup-daily.mjs` for custom-format logical database dumps and Storage bucket object downloads, plus `scripts/restore-verify.sql` for selected core table counts, audit hash-chain verification, and Storage object counts.
- Added backup/recovery, monitoring, downtime, and quarterly access-review procedures with RTO/RPO placeholders and explicit hosted configuration steps.
- Added migration `20261112000049_operations_readiness.sql`: an audited Super Admin downtime flag, write-blocking triggers on listed clinical/operational tables, bounded operational alert counters, and a Super Admin dormant-staff report with optional suspension after 60 days.
- Added the `monitoring` Edge Function uptime endpoint and allowlisted telemetry ingestion. Browser telemetry sends only event type, approved error class, module, and environment; it omits exception text, stack, request data, and patient/user identifiers. Notification-dispatch failures use the safe Edge telemetry helper.
- The module inventory now distinguishes repository implementation from live Supabase validation. The evidence tracker records a responsible owner and evidence link for each go-live control; all controls remain unverified until live-project evidence is collected.

Prior repository-check results are historical and do not certify the current checkout. No tests or live Supabase validation were run for this documentation update. Migration application, restore, PITR, encrypted off-site backup scheduling, Storage recovery, alert delivery, Edge Function telemetry, downtime write-block coverage, dormant-account actions, and role-based login checks remain unverified. Do not represent this work as certification, compliance, or production readiness.

## Priority improvements before clinical production use

1. **Validate server-side authorization in Supabase.** Reconcile the deployed migration history and current schema, preflight records without a facility assignment, and exercise each role/facility scope in staging. Client-side checks are not a security boundary.

2. **Complete medication safety operations.** Barcode MAR, lot-aware stock and atomic dispensing have repository implementations and tests. Validate workflows and configure local formulary, controlled-medicine governance, and medication reconciliation across transitions.

3. **Use medication identifiers and lot-level inventory.** Store an RxNorm or local formulary identifier, dose/form/unit, barcode, lot/batch, expiry, supplier, and location. Match dispensing by identifier and lot—not display name—to avoid look-alike/sound-alike medication errors. [USCDI medications](https://www.healthit.gov/isp/uscdi-data-class/medications) identifies medication, dose amount, and dose unit as interoperable data elements.

4. **Validate result acknowledgement and escalation.** Critical-result acknowledgement, routing and notification code/tests exist; live recipient assignment, delivery and overdue-result operations still need staging validation. The ONC SAFER Guides treat test-result reporting and follow-up as a core EHR safety domain. [ONC SAFER Guides](https://healthit.gov/clinical-quality-and-safety/safer-guides)

5. **Complete medication reconciliation at every transition.** Existing reconciliation records and medication workflows need complete admission, transfer, discharge, referral, and portal review and clinical acceptance. WHO identifies medication safety at transitions, polypharmacy, and high-risk situations as priority areas. [WHO medication safety](https://www.who.int/publications/i/item/WHO-UHC-SDS-2019.10)

6. **Harden audit integrity and downtime recovery.** Audit trails should be append-only, include authenticated actor, timestamp, before/after changes, and reason for sensitive access. Add a tested read-only/downtime procedure and recovery reconciliation. The current ONC SAFER framework includes organizational responsibilities, contingency planning, system management, patient identification, order entry/CDS, test-result follow-up, and clinician communication. [2025 SAFER Guides](https://healthit.gov/clinical-quality-and-safety/safer-guides)

7. **Standardize clinical terminology and interoperability.** Map diagnoses to ICD-10/SNOMED where appropriate, labs to LOINC, medications to RxNorm/local formulary codes, and make FHIR exports/resources conformant. The existing data model has a strong start for FHIR-aligned patient, encounter, medication, and allergy information, but needs coded values and validated exchange endpoints. [FHIR AllergyIntolerance](https://www.hl7.org/fhir/r4/allergyintolerance.html)

8. **Close deployment verification gaps.** This repository audit cannot inspect the hosted Supabase catalog/data, provider webhook state, Edge Function secrets, backups, monitoring, or production logs. Verify the migration history, current policies, active staff memberships, null facility preflight, refund/dispute provider configuration, and restore/downtime procedures in the actual staging environment before promoting changes.

## Recommended validation order

1. Reconcile migration history and validate server-side security/facility scope.
2. Run role-based clinical, pharmacy, laboratory, blood-bank, surgery and finance workflows in staging.
3. Validate patient identity, terminology, results escalation, and medication transitions with clinical owners.
4. Exercise audit, downtime, backup, restore, monitoring and recovery procedures.
5. Record approvals and evidence in the [go-live tracker](docs/status/evidence-tracker.md); do not mark controls verified from repository artifacts alone.

## Sources

1. Office of the National Coordinator for Health Information Technology. [SAFER Guides](https://healthit.gov/clinical-quality-and-safety/safer-guides), updated 2026.
2. World Health Organization. [Patient safety](https://www.who.int/news-room/fact-sheets/detail/patient-safety), 2023.
3. World Health Organization. [Medication safety in high-risk situations](https://www.who.int/publications/i/item/WHO-UHC-SDS-2019.10), 2019.
4. Office of the National Coordinator for Health Information Technology. [USCDI medications data class](https://www.healthit.gov/isp/uscdi-data-class/medications).
5. HL7. [FHIR R4 AllergyIntolerance](https://www.hl7.org/fhir/r4/allergyintolerance.html).
