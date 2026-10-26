# Security and Privacy Assessment

**Repository review only.** This is not a penetration test, privacy impact assessment, legal opinion, or regulatory certification.

## Existing controls observed

- Supabase Auth session handling and inactive-profile checks in the frontend.
- SQL RLS and role-specific policies in later migrations; private patient document storage policies.
- Database audit triggers/policies and patient-access log support.
- Staff provisioning occurs through an Edge Function using server-side secrets; the browser uses only URL/public anon key configuration.
- Payment, pharmacy dispensing, bed allocation, unidentified emergency identity and merge workflows use database transactions/RPCs in the migrations.

## Material risks / open verification

1. Security depends on the exact deployed migration order and policy state; the browser role matrix is not a boundary.
2. Historical migration files contain broad authenticated policies. Confirm final migrations remove/replace all broad policies on every exposed table.
3. New tables/RPCs need least-privilege grants, RLS, actor validation, stable `search_path`, and idempotency/concurrency review.
4. Patient merge and records access need end-to-end tests across every patient-linked table and Storage object.
5. Browser configuration is stored locally; protect shared workstations, secure sessions, enforce timeout/revocation, and do not store privileged keys there.
6. Audit completeness, append-only enforcement, retention, actor attribution and read auditing need deployed verification.
7. File upload MIME/size/content scanning, private signed URL expiry, and malware handling need review.
8. Backups, encryption-at-rest configuration, disaster recovery, breach response, monitoring and downtime reconciliation are deployment responsibilities and were not verified.
9. No test runner, lint/build toolchain, dependency lockfile or security scanning configuration is present in `package.json`.

## Required controls before live PHI

- Validate RLS for every exposed table, view, RPC, Storage bucket and Edge Function using real role accounts and adversarial patient-ID changes.
- Review MFA, privileged-account policy, session expiry/revocation, onboarding/offboarding, access reviews, device controls, secret rotation and incident response.
- Test database backup restoration and recovery objectives; document downtime procedure and reconcile downtime records.
- Establish audit monitoring and retention; ensure logs contain no passwords, tokens or unnecessary clinical payloads.
- Obtain privacy/legal review for the actual jurisdiction and processing model, including applicable Nigerian requirements if deployed in Nigeria. Obtain clinical governance approval for care workflows.
- Validate clinical terminology, decision support, result escalation, consent forms, prescribing and medication administration with qualified local owners.

No claim of compliance, certification, or clinical safety assurance is made by this document.
