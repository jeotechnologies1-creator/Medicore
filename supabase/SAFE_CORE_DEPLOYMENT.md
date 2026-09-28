# Safe-core deployment actions

Apply `safe_core_multibranch.sql` after `role_authorization.sql` in staging, perform role tests, back up production, then apply it during an approved maintenance window.

Patient chart reads are written directly to `patient_access_logs`; they no longer depend on PostgREST resolving a custom RPC. A database trigger stamps the active actor, time, action, and source. RLS permits inserts only for active staff or a patient accessing their own linked record, and authenticated clients cannot alter or delete logged events.

```sql
-- Reapply the updated safe_core_multibranch.sql first so the table, trigger,
-- RLS insert policy, and grants exist. This block is safe to rerun afterward.
drop policy if exists "authorized users log patient access" on public.patient_access_logs;
create policy "authorized users log patient access" on public.patient_access_logs for insert with check (
  public.is_staff() or public.can_access_patient(patient_id)
);
grant select, insert on public.patient_access_logs to authenticated;
revoke update, delete, truncate, references, trigger on public.patient_access_logs from authenticated;
notify pgrst, 'reload schema';
```

Apply the updated `safe_core_multibranch.sql` to the same project the app uses, then reload the app after the SQL Editor query completes.

To confirm the direct-write policy and actor-stamping trigger are installed, run:

```sql
select
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'patient_access_logs' and policyname = 'authorized users log patient access' and cmd = 'INSERT') as insert_policy_installed,
  exists (select 1 from pg_trigger where tgrelid = 'public.patient_access_logs'::regclass and tgname = 'stamp_patient_access_log' and not tgisinternal) as actor_stamp_trigger_installed,
  has_table_privilege('authenticated', 'public.patient_access_logs', 'INSERT') as authenticated_can_insert;
```

All three results should be `true`. If not, the updated migration was not fully applied to the app's project.

## Actions outside this repository

1. In Supabase Auth, require MFA for Super Admin, clinical, finance, and support accounts. Enrol two Super Admins before enforcement. Configure password policy, CAPTCHA/rate limits, session lifetime, and a tested password-recovery flow.
2. Configure managed daily backups and point-in-time recovery. Assign recovery owners and perform/document a restore test. Settings record policy intent only; they cannot create a provider backup.
3. Create every branch in `facilities`, assign staff `profiles.facility_id`, and add approved NGN accounts in `facility_bank_accounts`. Finance must verify an account before it becomes primary.
4. Appoint a medical director, data-protection officer, safety lead, and recovery owner. Complete the NDPA privacy assessment, processing register, retention schedule, breach process, patient-rights process, and staff training before live use.
5. Do not expose `fhir_exchange_jobs` to the internet. Build a server-side FHIR R4 integration only after selecting a terminology service, endpoint, credentials, consent rules, and an interoperability owner.
6. Adopt and test a downtime procedure: approved forms, unique downtime encounter ID, reconciliation owner/queue, and restoration drill. Record outages in `downtime_events`.

## Limitation

A browser cannot enforce MFA across devices, run provider backups, send payment confirmations, or prove NDPA compliance. Those require Supabase configuration, operational ownership, and documented evidence.
