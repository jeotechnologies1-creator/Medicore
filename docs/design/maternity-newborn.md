# Maternity and newborn module — design proposal

**Status:** Draft for review. This document defines the proposed model and access boundaries only. It does not implement schema, roles, screens, or workflows.

## Scope and design rules

- A maternity episode groups care for one mother in one facility. It links to the mother’s existing patient identity, facility, and applicable appointments and encounters.
- The newborn receives an independent `patients` row and patient identifier. A separate relationship links that identity to the mother and birth episode; newborn clinical data does not live on the mother’s patient row.
- Clinical entries retain author, authentication identity, facility, event time, and creation time. Signed or finalized records are corrected through attributed amendments, not overwritten.
- Structured clinical content and code lists are versioned/configurable. The module must not calculate or display invented scores, thresholds, alerts, treatment rules, or protocol steps. Every such threshold or protocol is **configurable by clinical lead**.
- Birth and outcome reports use explicit, versioned outcome categories and definitions approved by the clinical lead. They must not infer an outcome from free text.

## Proposed data model

All records below have UUID primary keys, timestamps, and facility ownership. Patient references use the existing `patients` table. Facility and staff references use the existing organization model. Proposed table names are working names.

| Record | Relationships and principal content |
| --- | --- |
| `maternity_episodes` | Mother patient, facility, episode status, pregnancy dating fields as documented by staff, booking date, booking appointment/encounter references, responsible maternity team, close reason/time. One episode can have many visits, one labour record, a delivery record, postnatal checks, and one or more newborns. |
| `maternity_visits` | Episode, mother patient, encounter, visit time, author, structured visit observations, examination and plan fields, linked orders/referrals where applicable. Booking is represented by the episode plus its first linked visit, not a separate patient identity. |
| `maternity_risk_flags` | Episode and mother patient, coded/configured risk concept, source, status, recorded-by, review and resolution history. Flags are informational clinical records; no score or automated care rule is inferred. |
| `maternity_labour_records` | Episode, mother patient, labour encounter, start/end and status, responsible staff, configurable narrative and event fields. The record holds the labour/delivery context and references the resulting delivery outcome. |
| `maternity_partograph_observations` | Labour record, mother patient, observed-at time, author, observation type/code, value, unit, source, and correction link. The set of charted fields and any plot, timing, limit, alert, or action logic must be configured by clinical lead. No clinical threshold is bundled. |
| `maternity_delivery_outcomes` | Episode, mother patient, labour record/encounter, delivery time, author, configured mode and outcome codes, attendant, facility/location, maternal outcome code, and narrative. It is the parent event for each newborn delivered in that event; the model permits multiple newborns. Outcome vocabularies and all decision protocols are configurable by clinical lead. |
| `maternity_newborn_links` | Delivery outcome, mother patient, newborn patient, relationship type, linkage status, registration status, and author. Each newborn has its own patient row and can have its own encounters, conditions, medications, and immunisations. Relationship changes are audited. |
| `maternity_postnatal_checks` | Episode, mother patient, linked encounter, check time, author, configurable maternal check fields, plan and disposition. Newborn checks are stored against the newborn patient and linked to the delivery/episode, rather than in the maternal check row. Any check schedule, threshold, escalation, or protocol is configurable by clinical lead. |
| `maternity_newborn_checks` | Newborn patient, delivery/newborn link, encounter, check time, author, configurable newborn observation fields, plan and disposition. No derived score or treatment recommendation is implied by captured fields. |
| `maternity_immunization_links` | Newborn patient, existing `immunizations` row, delivery/newborn link, author, and link type. Actual vaccine records remain in the existing immunisation workflow and are associated with the newborn patient ID. This link records maternity context without duplicating the immunisation event. |
| `maternity_transfers` | Episode, mother patient, optional newborn patient/link, sending and receiving facility, referral/transfer destination, requested and actual times, status, reason, handover content, author and acknowledger. Mother and newborn transfer links are independent so one can transfer without implying the other did. |
| `maternity_outcome_categories` | Facility/global approved code, outcome domain (maternal or neonatal), display, active period, version, and clinical lead approval. Reporting groups by these codes and their effective dates. No outcome category is hard-coded as a clinical conclusion. |
| `maternity_audit_events` or standard row audit | Actor, authentication identity, facility, record, action, event time, and before/after metadata under existing audit/privacy policy. Clinical payloads and infant identifiers must not be copied into general operational logs. |

### Newborn identity creation and birth-registration hook

Newborn registration is one transaction: validate an authorized maternity episode and delivery outcome; run the newborn duplicate-review flow; create the newborn in `patients`; create the mother/newborn relationship; and record a birth-registration event for downstream Task 25 integration. A failure at any step leaves no partial newborn or dangling relationship.

The existing general patient duplicate search requires name, date of birth, and phone for exact matching. A newborn may not have a phone or finalized name, so implementation needs a birth-specific duplicate check that does not fabricate either value. It should compare the available identity attributes and episode/mother linkage, return exact and possible matches for staff review, and never silently merge or discard a candidate. The clinical lead and registration owner must approve the matching attributes and review behavior before implementation. A confirmed existing newborn must be linkable to the delivery without creating a second patient.

The birth-registration hook is an outbox contract for Task 25, not a direct dependency on a future module. Proposed event: `maternity.newborn.registered`, with a versioned schema, stable event/idempotency key, facility, delivery event ID, mother patient ID, newborn patient ID, registration state, and occurrence time. Only the minimum fields needed by the approved registration process are included. Delivery is asynchronous and retryable; duplicate delivery is idempotent. Task 25 owns the external birth-registration mapping and any additional legal fields. The maternity transaction must not wait for that external service.

## Privacy and authorization scoping

### Facility and department boundaries

- Every maternity row carries `facility_id` directly or inherits it through a non-null parent whose facility is checked by database constraints/triggers. Parent-child facility mismatches are rejected server-side.
- Row-level policies require both patient/facility access and an active membership in that facility’s Maternity department (or its approved child unit). A patient’s home facility alone does not grant staff access.
- Access uses explicit maternity permissions such as `maternity.read`, `maternity.visit.write`, `maternity.labour.write`, `maternity.outcome.write`, `maternity.newborn.register`, `maternity.transfer`, `maternity.report`, and `maternity.manage`. Generic `patient.read` or general nurse/doctor role membership alone does not grant maternity access.
- Proposed staff roles are `midwife`, `obstetrician`, and a narrowly scoped `maternity_admin`; they must be added to the allowed role model and assigned facility-scoped grants. The role matrix should separate clinical authoring, newborn identity registration, outcome reporting, and configuration. Emergency access, if approved, must use the existing audited break-glass path with reason and review.
- Any cross-facility transfer grants the receiving maternity team access only after an explicit transfer acceptance. Referral/transfer metadata is visible to the sending and receiving teams according to the transfer state; unrelated records at either facility remain out of scope.

### Mother/newborn relationship boundaries

- The relationship permits maternity staff who already have access to the episode to navigate between the linked mother and newborn records for that episode. It does not make the newborn’s full patient record readable under the mother’s permissions or vice versa.
- Newborn record access is evaluated against the newborn’s own patient ID, facility assignment, active maternity membership, and episode relationship. When the newborn moves facility, access follows an explicit transfer, not the mother’s location.
- The relationship is not a proxy-account or consent grant. Any later guardian or patient-portal access requires a separate verified authority/consent workflow and its own audit trail.
- Patient-facing views must not expose another parent/newborn’s identity or clinical data because of a shared maternity episode.

### Data handling and audit

- RLS applies to direct table reads and writes; security-definer registration, transfer, and outcome functions repeat role, facility, department, and parent-link checks.
- Final outcomes, partograph observations, newborn identity links, and transfer acknowledgements are append-only or amended through attributed correction records. Access and exports are audited using existing privacy controls.
- Reporting is facility- and department-scoped, aggregates maternal and neonatal outcomes separately, uses approved category versions, and avoids identifiable row-level downloads unless the caller has a specific clinical permission.

## User-facing screens (proposed)

1. **Maternity worklist:** facility-scoped bookings and open episodes, with status and assigned team; no cross-facility search by default.
2. **Episode overview:** mother identity, booking, visits, active flags, linked encounters, labour/delivery, postnatal plan, transfers, and linked newborn identities under separate access checks.
3. **Antenatal visit:** structured visit fields, observations, authored plan, and append-only history. Configured content may vary by facility/version.
4. **Labour and partograph:** timestamped observations and event log, with configured chart fields. The screen must not add default alert lines, thresholds, action prompts, or protocol recommendations.
5. **Delivery and outcomes:** structured maternal outcome plus one newborn registration flow per newborn; duplicate candidates are reviewed before identity creation.
6. **Postnatal care:** separate maternal and newborn check lists and encounter links; linked immunisations open/create records against the newborn patient.
7. **Referral/transfer:** destination, handover, status, acknowledgement and explicit mother/newborn transfer selection.
8. **Maternity reporting:** aggregate maternal and neonatal outcomes with documented category versions, reporting period, and facility scope.

## Reporting semantics

- Maternal outcomes and neonatal outcomes are separate records and separate denominators. Multiple newborns from one delivery contribute one maternal delivery event and the appropriate number of newborn records.
- Reports use delivery time/facility as the event anchor, and distinguish event facility from current patient facility after transfer.
- Missing, unknown, not recorded, and not applicable remain distinct states; reports do not treat missing values as a negative/normal result.
- Outcome category changes are versioned. Historical reports retain the category version used at the time, or explicitly disclose a reviewed remapping.
- Any report threshold, alert, risk grouping, or quality protocol is **configurable by clinical lead** and must be reviewed before being enabled.

## Decisions requested before implementation

1. Approve the proposed maternity roles and permissions, especially whether newborn identity registration belongs to clinical maternity staff, a registrar, or both.
2. Approve the minimum newborn identity fields and duplicate-review attributes for unnamed/newborn-without-phone cases.
3. Approve the configurable antenatal, labour/partograph, delivery, and postnatal field sets and outcome vocabularies. Every threshold or protocol remains **configurable by clinical lead**.
4. Confirm which existing event/outbox connection Task 25 will consume and the allowed birth-registration payload fields.

Implementation is intentionally paused until this design is approved.
