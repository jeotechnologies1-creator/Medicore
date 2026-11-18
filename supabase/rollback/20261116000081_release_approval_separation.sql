begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

revoke select on public.disclosure_register from authenticated;
drop policy if exists disclosure_register_records_read on public.disclosure_register;

create or replace function public.list_data_subject_request_queue()
returns setof public.data_subject_requests language plpgsql security definer set search_path=public as $$
declare actor uuid; req public.data_subject_requests%rowtype;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'
   and role::text in ('super_admin','records_officer') limit 1;
  if actor is null then raise exception 'Data-subject request queue access denied'; end if;
  for req in select * from public.data_subject_requests where status not in ('completed','declined','withdrawn') order by due_at loop return next req; end loop;
end $$;

create or replace function public.approve_release_information_request(p_request_id uuid,p_redaction_notes text default null,p_second_review boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; r public.release_information_requests%rowtype;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 select * into r from public.release_information_requests where id=p_request_id for update;
 if actor is null or r.id is null or r.status not in ('verified','approved') or not public.has_patient_facility_access(r.patient_id) then
  raise exception 'Only a Records Officer may approve a verified release request.';
 end if;
 if not p_second_review then
  if r.approved_by is not null or (r.sensitive_scope and actor=r.identity_verified_by) then
   raise exception 'Primary approval must be by a different Records Officer after verification.';
  end if;
  update public.release_information_requests set status='approved',approved_by=actor,approved_at=now(),redaction_notes=nullif(btrim(p_redaction_notes),''),updated_at=now() where id=r.id;
 else
  if not r.sensitive_scope or r.approved_by is null or r.second_reviewed_by is not null or actor=r.approved_by or r.status<>'approved' then
   raise exception 'Sensitive-scope approval requires a distinct second Records Officer.';
  end if;
  update public.release_information_requests set second_reviewed_by=actor,second_reviewed_at=now(),
   redaction_notes=coalesce(nullif(btrim(p_redaction_notes),''),redaction_notes),updated_at=now() where id=r.id;
 end if;
end $$;

notify pgrst,'reload schema';
commit;
