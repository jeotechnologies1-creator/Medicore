# Blood bank and transfusion traceability

## Design status

Implementation follows this design. ABO/Rh and component compatibility are never inferred in application code and no compatibility rows are seeded. A facility cannot issue a unit until a clinical owner has reviewed and activated a facility-specific compatibility rule set.

## Data model

- `blood_donors` stores a facility-scoped donor identifier and optional demographic linkage. Donor information is restricted to blood-bank and clinical staff; patient-facing reads are not allowed.
- `blood_units` stores a unique facility unit number, donor reference, component type, blood group, expiry, collection metadata, and facility. Current status is derived from append-only unit events (`received`, `quarantined`, `available`, `issued`, `returned`, `transfused`, `discarded`, `recalled`).
- `blood_bank_clinical_owners` assigns one active facility owner. `blood_compatibility_rules` maps component type, donor group, and recipient group to a configured compatibility decision. Rules carry version and owner review identity/time. No defaults are inserted. The highest reviewed facility rule version is current; missing pairs fail closed, and a newer version invalidates older crossmatch results for issue.
- `blood_crossmatch_requests` links a patient and encounter to the requested component and recorded recipient group. `blood_crossmatch_results` records laboratory author, tested unit, result, and timestamp as immutable events.
- `blood_unit_events` records unit lifecycle, actor, patient/request context, timestamps, cold-chain acceptance, and reason. Issue and return are explicit events.
- `transfusion_records` links a patient, encounter, crossmatch, and unit. An immutable verification event records two distinct staff identities and confirmations. `transfusion_observations` records before/during/after observations with the supplied vital-sign payload and timestamp. `transfusion_reactions` captures reaction reports and follow-up as immutable records.
- `blood_bank_audit` is provided by the platform's standard row audit trigger on all workflow and configuration tables.

Every clinical object is facility-bound, patient/encounter consistency is checked by server workflows, and events are append-only. Corrections are new attributed records; issued/transfused unit history is never rewritten.

## Workflow and enforcement

1. Authorized blood-bank staff register a donor and unit. The unit is not issueable until its lifecycle event makes it available.
2. Laboratory staff create a crossmatch request and append a result for a specific unit. Only a compatible result under the currently active, clinically reviewed rule set permits issue.
3. Issue records server time and a cold-chain acceptance decision. Return records server time, acceptance decision, and reason. Returns do not silently make a unit available; a new authorized availability event is required.
4. At bedside, two distinct authorized staff verify patient and unit against the request; the second staff member co-signs with their own PIN. A before observation must precede the start event. During and after observations are timestamped while the transfusion is in progress. Completion requires all three observation phases.
5. Reaction reporting links directly to the transfusion/unit and remains available for audit and recall follow-up.
6. A facility-scoped recall query returns every matching unit, event, crossmatch, patient, and transfusion record, including any returned, transfused, or discarded status.

## Access and privacy

RLS scopes all records to facility. Workflow RPCs also require the relevant blood-bank, laboratory, or clinical permission and an active staff profile. Laboratory-only result authoring is restricted to laboratory staff; bedside documentation is restricted to authorized clinical staff. Donor data is never exposed through patient workflows. Cross-facility staff do not gain access from a patient relationship alone.

## Screens

- Blood bank inventory: donor/unit registration, status, expiry, quarantine, and recall search.
- Crossmatch: request queue, selected unit, laboratory result entry, and compatibility rule-set review state.
- Issue/return: unit lookup, cold-chain acceptance, timestamps, and return reason.
- Bedside transfusion: patient/unit two-person verification, before/during/after observations, completion, and reaction report.
- Traceability: recall search with full downstream unit-to-patient history.

The compatibility rule editor is for a designated clinical owner. Configuration remains inactive until reviewed; the system does not suggest or prepopulate clinical compatibility decisions.

## Validation and tests

pgTAP covers facility isolation, role restrictions, unreviewed/missing rule sets, incompatible and absent crossmatch results, unit expiry/status, duplicate verifier rejection, event immutability, reaction links, and recall traceability. Playwright covers inventory/crossmatch/issue/bedside/recall interactions using nonclinical fixtures.
