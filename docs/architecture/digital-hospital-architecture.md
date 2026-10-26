# Digital Hospital Architecture

**Current state: existing browser application with Supabase-managed data and identity.** This document describes observed repository code, not a deployment inspection. Runtime project configuration, enabled Auth providers, database contents, backups, and external integrations were not available for verification.

## Current architecture

- `index.html` loads React, Babel, Supabase JS, and ordered application scripts. `src/app.js` is the UI entry point; modules are browser globals that share a scope. There is no bundler or server-side web application in `package.json`.
- `src/js/core.js` normalizes rows and loads application datasets. Feature components call the Supabase client directly; `src/supabase.js` wraps basic reads/inserts/updates/upserts.
- Supabase Postgres is the system of record. SQL migrations define tables, constraints, RLS, triggers, RPC functions, storage policies, and audit behavior. Edge Functions provision staff and patient portal accounts.
- Supabase Auth persists browser sessions and uses the public anon key. No service-role key belongs in the frontend. Server-side function secret configuration is deployment-managed and unverified here.
- Navigation uses fixed module maps plus role/module matrices. Database RLS and RPC checks are the security boundary; browser visibility is only a usability control.
- There is no durable event bus/outbox or background worker documented. Notifications and workflow events are database rows/triggers/RPCs.

## Target domain boundaries

1. **Identity and organisation:** profiles, auth identities, facilities, departments, assignments, roles, permissions, audit.
2. **Patient identity:** stable patient UUID and facility MRN, identifiers, contacts, consent, documents, identity reconciliation.
3. **Care:** encounter, observations, notes, diagnoses, allergies, plans, tasks, procedures, referrals, admission/discharge.
4. **Orders and results:** laboratory/imaging requests, specimen/report lifecycle, validation, acknowledgement/escalation.
5. **Medication:** formulary, medication order, dispense transaction, lot movement, administration, reconciliation.
6. **Revenue and finance:** charge source, invoice, payment, claim, approval, ledger and reconciliation.
7. **Operations:** appointment/queue, ward/bed, workforce, procurement/inventory, facilities, quality/safety.

## Data flow and transaction boundaries

- User actions authenticate with Supabase Auth; RLS checks the profile and record scope.
- Single-row clinical records are written to their owning table and receive server-side audit/workflow triggers where configured.
- Bed assignment, patient identity merge, emergency unidentified registration, pharmacy dispensing, and payment review use database functions for transactional operations.
- Cross-module follow-up and notifications should be durable database records. Where asynchronous delivery is later introduced, write an outbox row in the same transaction as the clinical change and make consumers idempotent.
- A failed external notification must never undo a saved result or admission; it must create a visible retry/escalation task.

## Important limitations and decisions

- Clinical components still contain presentation logic and Supabase queries; there is no generated API/type contract layer.
- Department hierarchy and permission assignments are not yet configurable as a complete organizational model.
- Current FHIR-shaped export is not evidence of a conformant FHIR server or profile implementation. Imaging PACS/DICOM, payer, laboratory equipment, and messaging integrations are not present in the repository.
- Actual RLS behavior depends on applying migrations in order to the correct project and testing live roles. No live schema was queried in this audit.
- OneMed is not described here as certified, compliant, clinically validated, or production-ready.

## Architecture guardrails

- Keep patient UUID as primary key; use a facility-scoped MRN as a human identifier.
- Keep patient, encounter, admission, service order, result, invoice, payment, dispense, and administration as distinct records and statuses.
- Prefer narrow RPCs for multi-row or concurrency-sensitive workflows. Revoke direct table writes where an RPC owns a transition.
- Keep corrections append-only or versioned for signed clinical and posted financial records.
- Establish migrations as the schema source of truth and test them against a disposable/staging database before deployment.
