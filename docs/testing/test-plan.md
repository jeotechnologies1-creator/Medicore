# Test Plan and Results

## Current automated coverage

`npm test` runs `tests/regression-checks.mjs`. It is a repository-level static assertion suite covering selected security policies, migrations, route/module wiring, workflow guards, and UI contracts. In the current audit run it **passed**. `git diff --check` **passed**.

`package.json` has no build, lint, typecheck, browser, SQL, or integration-test scripts. No database URL/credentials or running local Supabase database were available, so no SQL migration execution, RLS session test, or end-to-end browser test was run. The Supabase CLI schema-lint help invocation was blocked when the CLI attempted to write telemetry outside the workspace.

An initial `supabase test db` pgTAP suite now checks organization tables, permission scoping, membership isolation, denied non-admin writes, and a cashier-to-Accounts payment approval/posting path. It still must be run against the local stack after all migrations apply.

## Required suites before release

| Suite | Scenarios |
|---|---|
| Authentication/session | Active/inactive user, expiration, logout/revocation, recovery, MFA/privileged role. |
| Authorization/RLS | Each role × table action; direct REST/RPC/Storage; patient A cannot access B; no self-elevation. |
| Patient identity | Duplicate warning, MRN uniqueness, manual merge review, atomic references, audit and recovery. |
| Appointment/encounter | Capacity conflict, check-in, emergency bypass, clinician ownership, signature, addendum, closure. |
| Laboratory/radiology | Order, specimen, QC, preliminary/final/corrected result, critical notification, acknowledgement and escalation. |
| Medication | Prescription validation, full multi-item atomic dispense, lot/expiry, concurrent stock, administration separately, reconciliation. |
| Inpatient/surgery | Concurrent same-bed allocation, requested-ward constraint, transfer, discharge release, surgery status guards/consent. |
| Finance | Duplicate charge idempotency, payment review, refund separation, claim retry/reconciliation, ledger immutability. |
| Inventory/procurement | Concurrent stock movement, no negative stock, approval, PO/receipt/return audit. |
| Audit/quality | Actor, before/after, reason, read access, append-only integrity, restricted incident access. |
| Data migration | Fresh install, supported upgrade paths, pre-existing data, rollback/recovery, rerun safety. |
| UI/accessibility | Keyboard, labels, screen reader, responsive devices, loading/empty/error/success and browser console. |
| Recovery/integration | Outbox retries, duplicate delivery, downtime capture/reconciliation, backup restore and failover. |

Use synthetic patients only. Record exact migration revision, role, expected/actual result, and evidence for every staging run. Do not label a test passed until it has actually executed.
