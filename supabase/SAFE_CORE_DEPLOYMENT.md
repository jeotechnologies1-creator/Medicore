# Safe-core deployment actions

Apply `safe_core_multibranch.sql` after `role_authorization.sql` in staging, perform role tests, back up production, then apply it during an approved maintenance window.

The migration defines `public.log_patient_access(uuid, text)` and requests a PostgREST schema-cache reload at the end. It drops and recreates the RPC so a deployed copy with older argument names cannot survive `CREATE OR REPLACE`. If the patient module still reports that `log_patient_access` cannot be found, confirm the app is configured for this same Supabase project and run this repair in that project's SQL Editor:

```sql
drop function if exists public.log_patient_access(uuid, text);

create function public.log_patient_access(target_patient_id uuid, access_purpose text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare actor uuid;
begin
  if not public.is_staff() and not public.can_access_patient(target_patient_id) then
    raise exception 'Not authorized to access this patient record';
  end if;
  select id into actor from public.profiles where auth_user_id = auth.uid() limit 1;
  insert into public.patient_access_logs(patient_id, actor_id, purpose)
  values (target_patient_id, actor, nullif(trim(access_purpose), ''));
end;
$$;

revoke all on function public.log_patient_access(uuid, text) from public;
grant execute on function public.log_patient_access(uuid, text) to authenticated;
notify pgrst, 'reload schema';
```

The repair requires `safe_core_multibranch.sql` prerequisites to exist. Reload the app after the SQL Editor query completes.

To confirm the deployed signature, run:

```sql
select
  to_regprocedure('public.log_patient_access(uuid,text)') as registered_signature,
  (select proargnames from pg_proc where oid = to_regprocedure('public.log_patient_access(uuid,text)')) as argument_names,
  has_function_privilege('authenticated', to_regprocedure('public.log_patient_access(uuid,text)'), 'EXECUTE') as authenticated_can_execute;
```

Expected values are `public.log_patient_access(uuid,text)`, `{target_patient_id,access_purpose}`, and `true`. If the signature is null, the migration/repair was not run against the app's project. If the argument names differ, run the repair above. If all three values match and the app still receives `PGRST202`, verify the app's configured Supabase project URL, run `NOTIFY pgrst, 'reload schema';` as a separate SQL Editor query, wait for it to complete, then reload the app.

## Actions outside this repository

1. In Supabase Auth, require MFA for Super Admin, clinical, finance, and support accounts. Enrol two Super Admins before enforcement. Configure password policy, CAPTCHA/rate limits, session lifetime, and a tested password-recovery flow.
2. Configure managed daily backups and point-in-time recovery. Assign recovery owners and perform/document a restore test. Settings record policy intent only; they cannot create a provider backup.
3. Create every branch in `facilities`, assign staff `profiles.facility_id`, and add approved NGN accounts in `facility_bank_accounts`. Finance must verify an account before it becomes primary.
4. Appoint a medical director, data-protection officer, safety lead, and recovery owner. Complete the NDPA privacy assessment, processing register, retention schedule, breach process, patient-rights process, and staff training before live use.
5. Do not expose `fhir_exchange_jobs` to the internet. Build a server-side FHIR R4 integration only after selecting a terminology service, endpoint, credentials, consent rules, and an interoperability owner.
6. Adopt and test a downtime procedure: approved forms, unique downtime encounter ID, reconciliation owner/queue, and restoration drill. Record outages in `downtime_events`.

## Limitation

A browser cannot enforce MFA across devices, run provider backups, send payment confirmations, or prove NDPA compliance. Those require Supabase configuration, operational ownership, and documented evidence.
