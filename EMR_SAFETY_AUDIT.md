# EMR Safety and Reliability Audit

## Current assessment

OneMed provides a useful foundation: patient registration, appointments, orders, results, admissions, pharmacy, billing, a portal, audit logs, and role-based navigation. The app now compiles cleanly across all browser-loaded scripts. Recent fixes address a dashboard crash, department persistence, inventory valuation, expiry counting, and stock-status updates after dispensing.

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

## Priority improvements before clinical production use

1. **Apply and test server-side authorization in Supabase.** The repository includes `production_hardening.sql` and the new `atomic_pharmacy_dispensing.sql`; apply them in a non-production project first, then test every role and patient path. Client-side checks are a usability layer, not a security boundary.

2. **Add barcode/lot selection to dispensing.** The new transaction follows FEFO (earliest-expiry-first) when no lot is supplied. The next step is an explicit barcode/lot scan and a dispense record per item/lot.

3. **Use medication identifiers and lot-level inventory.** Store an RxNorm or local formulary identifier, dose/form/unit, barcode, lot/batch, expiry, supplier, and location. Match dispensing by identifier and lot—not display name—to avoid look-alike/sound-alike medication errors. [USCDI medications](https://www.healthit.gov/isp/uscdi-data-class/medications) identifies medication, dose amount, and dose unit as interoperable data elements.

4. **Add a results acknowledgement and escalation workflow.** Lab and imaging results need an assigned responsible clinician, acknowledgement time, escalation rules for critical results, and an overdue-results work queue. The ONC SAFER Guides treat test-result reporting and follow-up as a core EHR safety domain. [ONC SAFER Guides](https://healthit.gov/clinical-quality-and-safety/safer-guides)

5. **Implement medication reconciliation at every transition.** Admission, transfer, discharge, referral, and portal medication lists should reconcile active medications, allergies, discontinued medications, and patient instructions. WHO identifies medication safety at transitions, polypharmacy, and high-risk situations as priority areas. [WHO medication safety](https://www.who.int/publications/i/item/WHO-UHC-SDS-2019.10)

6. **Harden audit integrity and downtime recovery.** Audit trails should be append-only, include authenticated actor, timestamp, before/after changes, and reason for sensitive access. Add a tested read-only/downtime procedure and recovery reconciliation. The current ONC SAFER framework includes organizational responsibilities, contingency planning, system management, patient identification, order entry/CDS, test-result follow-up, and clinician communication. [2025 SAFER Guides](https://healthit.gov/clinical-quality-and-safety/safer-guides)

7. **Standardize clinical terminology and interoperability.** Map diagnoses to ICD-10/SNOMED where appropriate, labs to LOINC, medications to RxNorm/local formulary codes, and make FHIR exports/resources conformant. The existing data model has a strong start for FHIR-aligned patient, encounter, medication, and allergy information, but needs coded values and validated exchange endpoints. [FHIR AllergyIntolerance](https://www.hl7.org/fhir/r4/allergyintolerance.html)

## Recommended delivery order

1. Server-side security and atomic medication dispensing.
2. Results acknowledgement/escalation and medication reconciliation.
3. Patient identity safeguards, barcode medication administration, and lot-level stock.
4. Audit immutability, downtime readiness, and backups/restoration drills.
5. Terminology services, FHIR APIs, quality measures, and accessibility/usability validation.

## Sources

1. Office of the National Coordinator for Health Information Technology. [SAFER Guides](https://healthit.gov/clinical-quality-and-safety/safer-guides), updated 2026.
2. World Health Organization. [Patient safety](https://www.who.int/news-room/fact-sheets/detail/patient-safety), 2023.
3. World Health Organization. [Medication safety in high-risk situations](https://www.who.int/publications/i/item/WHO-UHC-SDS-2019.10), 2019.
4. Office of the National Coordinator for Health Information Technology. [USCDI medications data class](https://www.healthit.gov/isp/uscdi-data-class/medications).
5. HL7. [FHIR R4 AllergyIntolerance](https://www.hl7.org/fhir/r4/allergyintolerance.html).
