# Safe-core deployment actions

Apply `safe_core_multibranch.sql` after `role_authorization.sql` in staging, perform role tests, back up production, then apply it during an approved maintenance window.

## Actions outside this repository

1. In Supabase Auth, require MFA for Super Admin, clinical, finance, and support accounts. Enrol two Super Admins before enforcement. Configure password policy, CAPTCHA/rate limits, session lifetime, and a tested password-recovery flow.
2. Configure managed daily backups and point-in-time recovery. Assign recovery owners and perform/document a restore test. Settings record policy intent only; they cannot create a provider backup.
3. Create every branch in `facilities`, assign staff `profiles.facility_id`, and add approved NGN accounts in `facility_bank_accounts`. Finance must verify an account before it becomes primary.
4. Appoint a medical director, data-protection officer, safety lead, and recovery owner. Complete the NDPA privacy assessment, processing register, retention schedule, breach process, patient-rights process, and staff training before live use.
5. Do not expose `fhir_exchange_jobs` to the internet. Build a server-side FHIR R4 integration only after selecting a terminology service, endpoint, credentials, consent rules, and an interoperability owner.
6. Adopt and test a downtime procedure: approved forms, unique downtime encounter ID, reconciliation owner/queue, and restoration drill. Record outages in `downtime_events`.

## Limitation

A browser cannot enforce MFA across devices, run provider backups, send payment confirmations, or prove NDPA compliance. Those require Supabase configuration, operational ownership, and documented evidence.
