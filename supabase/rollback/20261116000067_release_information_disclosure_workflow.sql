-- Release, identity-verification, and disclosure records are accountability
-- evidence. Preserve them and fix forward rather than deleting disclosure history.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
 if exists(select 1 from public.release_information_requests) or exists(select 1 from public.data_subject_deadline_policies)
   or exists(select 1 from public.disclosure_register where release_request_id is not null)
   or exists(select 1 from public.data_subject_requests where identity_verified_at is not null or authorization_verified_at is not null or due_at is null) then
  raise exception 'Rollback refused for 20261116000067: preserve release, disclosure, and patient request verification/deadline evidence; fix forward.';
 end if;
end $$;
drop trigger if exists data_subject_request_verification_guard on public.data_subject_requests;
drop function if exists public.guard_data_subject_request_verification();
drop function if exists public.verify_data_subject_request(uuid,text,text);
drop function if exists public.configure_data_subject_deadline(uuid,text,integer,text);
drop function if exists public.release_information_request(uuid,text[],text);
drop function if exists public.deny_release_information_request(uuid,text);
drop function if exists public.approve_release_information_request(uuid,text,boolean);
drop function if exists public.verify_release_information_request(uuid,text,text,text);
drop function if exists public.intake_release_information_request(uuid,text,text,text,text,text[],boolean);
drop trigger if exists audit_data_subject_deadline_policies on public.data_subject_deadline_policies;
drop trigger if exists audit_release_information_requests on public.release_information_requests;
drop table if exists public.data_subject_deadline_policies;
drop table if exists public.release_information_requests;
alter table public.disclosure_register drop constraint if exists disclosure_register_release_request_fkey;
drop index if exists public.release_information_disclosure_unique;
alter table public.disclosure_register drop column if exists release_request_id;
alter table public.disclosure_register drop column if exists requester_relationship;
alter table public.disclosure_register drop column if exists released_scope;
alter table public.disclosure_register drop column if exists redaction_notes;
alter table public.data_subject_requests drop column if exists facility_id;
alter table public.data_subject_requests drop column if exists identity_verified_by;
alter table public.data_subject_requests drop column if exists identity_verified_at;
alter table public.data_subject_requests drop column if exists identity_method;
alter table public.data_subject_requests drop column if exists authorization_verified_by;
alter table public.data_subject_requests drop column if exists authorization_verified_at;
alter table public.data_subject_requests drop column if exists authorization_basis;
alter table public.data_subject_requests alter column due_at set not null;
alter table public.data_subject_requests alter column due_date_basis set default 'provisional_configuration_pending_legal_review';
create or replace function public.create_data_subject_request(p_patient_id uuid,p_request_type text,p_description text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; linked_patient uuid; due_days integer; request_id uuid;
begin
 select id,patient_id into actor,linked_patient from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
 if actor is null or p_request_type not in ('access','correction','restriction') or length(btrim(coalesce(p_description,'')))<10 then raise exception 'Active profile, supported request type, and description are required'; end if;
 if p_patient_id is not null and linked_patient is distinct from p_patient_id and not public.has_patient_facility_access(p_patient_id) then raise exception 'Patient request scope denied'; end if;
 select coalesce(nullif(setting_value#>>'{}','')::integer,30) into due_days from public.system_settings where setting_key='data_subject_request_due_days';
 due_days:=greatest(1,least(coalesce(due_days,30),365));
 insert into public.data_subject_requests(patient_id,requester_profile_id,request_type,description,due_at)
 values(coalesce(p_patient_id,linked_patient),actor,p_request_type,btrim(p_description),now()+make_interval(days=>due_days)) returning id into request_id;
 return request_id;
end $$;
revoke all on function public.create_data_subject_request(uuid,text,text) from public,anon;
grant execute on function public.create_data_subject_request(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
