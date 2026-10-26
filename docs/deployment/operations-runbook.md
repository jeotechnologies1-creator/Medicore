# Deployment and Operations Runbook

**This repository review did not inspect a live Supabase project or production hosting environment.** Confirm current operator procedures before using this as a facility runbook.

## Configuration and deployment

1. Create a non-production Supabase project and configure the app's Supabase URL/public anon key using the supported `window.__ONEMED_SUPABASE__` injection or Settings flow. Never place the service-role key in browser config.
2. Review `README.md` and `supabase/DEPLOYMENT.md`; apply SQL migrations in documented order to a disposable/staging database first. Capture migration revision and output. Do not run synthetic patient seed data in production.
3. Test the exact upgrade path and existing-data state. Some historic scripts may not be rerunnable; take and verify a backup before any production change.
4. Deploy Edge Functions only after reviewing their code and configuring project-managed secrets. Verify auth, role guard, audit, rate limiting and failure handling.
5. Run the role/RLS test matrix, workflow tests, restore drill and clinical governance acceptance before production data entry.

## Monitoring and response (to be configured)

- Monitor Supabase Auth failures, database errors, RPC failures, Edge Function errors/latency, storage failures, result acknowledgement queues, and failed notifications.
- Assign an on-call technical owner and clinical escalation owner. Critical findings require a named recipient, deadline, acknowledgement and escalation; a dashboard badge alone is insufficient.
- Never log passwords, tokens, service credentials or unnecessary PHI. Restrict monitoring access and retention.
- Maintain secret rotation and staff access termination procedures. Review privileged and dormant accounts routinely.

## Backup and recovery

- Document database, Storage and configuration backup scope, frequency, encryption, retention, and recovery objectives with the hosting operator.
- Perform a restore into an isolated project and compare record counts/integrity before claiming recoverability.
- Document downtime forms, unique downtime patient/encounter identifiers, authorized clinical access, reconciliation owner, duplicate prevention and completion sign-off.
- The app removes legacy browser record caches and does not provide an offline clinical record system; do not use local storage as a downtime substitute.

## Change/incident management

- Use reviewed, versioned SQL migrations and staged deployment. Record approver, target project, start/end, outcome and recovery action.
- For suspected patient-data exposure or clinical integrity incident: preserve relevant audit evidence, contain affected access, notify designated privacy/security/clinical leads, and follow the facility's legally reviewed incident plan.
- Roll back application deployment only when compatible with database schema. Prefer forward-fix migrations for data changes; follow documented recovery plan before restoring data.

## Go-live gate

Use `EMR_GO_LIVE_CHECKLIST.md` together with the test plan and local governance approval. This runbook does not certify compliance or operational readiness.
