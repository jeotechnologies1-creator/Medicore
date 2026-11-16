begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Disclosure history is read-only to facility Records Officers. The release RPC
-- remains the only client write path and always creates this register row.
grant select on public.disclosure_register to authenticated;
drop policy if exists disclosure_register_records_read on public.disclosure_register;
create policy disclosure_register_records_read on public.disclosure_register
 for select to authenticated using (
  public.has_any_role(array['super_admin','records_officer'])
  and public.has_patient_facility_access(patient_id)
 );

-- Keep the established queue RPC, but ensure it returns only requests within
-- the caller's facility access. Super Admin retains cross-facility oversight.
create or replace function public.list_data_subject_request_queue()
returns setof public.data_subject_requests language plpgsql security definer set search_path=public as $$
declare actor uuid; actor_role text; req public.data_subject_requests%rowtype;
begin
 select id,role::text into actor,actor_role from public.profiles
  where auth_user_id=auth.uid() and status::text='active'
  and role::text in ('super_admin','records_officer') limit 1;
 if actor is null then raise exception 'Data-subject request queue access denied'; end if;
 for req in
  select r.* from public.data_subject_requests r left join public.patients p on p.id=r.patient_id
  where r.status not in ('completed','declined','withdrawn')
   and (actor_role='super_admin' or public.has_patient_facility_access(r.patient_id)
    or public.has_org_permission('patient.read',coalesce(r.facility_id,p.home_facility_id),null))
  order by r.due_at nulls last,r.received_at
 loop return next req; end loop;
end $$;
revoke all on function public.list_data_subject_request_queue() from public,anon;
grant execute on function public.list_data_subject_request_queue() to authenticated;

-- The staff profile recorded at intake is the workflow requester. It cannot
-- perform either approval step, even for non-sensitive scope. A sensitive
-- primary approver must also differ from the identity verifier.
create or replace function public.approve_release_information_request(p_request_id uuid,p_redaction_notes text default null,p_second_review boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; r public.release_information_requests%rowtype;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'
  and role::text in ('super_admin','records_officer') limit 1;
 select * into r from public.release_information_requests where id=p_request_id for update;
 if actor is null or r.id is null or r.status not in ('verified','approved')
  or not public.has_patient_facility_access(r.patient_id) then
  raise exception 'Only a Records Officer may approve a verified release request.';
 end if;
 if actor=r.received_by then
  raise exception 'The staff member who received a release request cannot approve it.';
 end if;
 if not p_second_review then
  if r.status<>'verified' or r.approved_by is not null
   or (r.sensitive_scope and actor=r.identity_verified_by) then
   raise exception 'Primary approval requires an independent authorized reviewer after verification.';
  end if;
  update public.release_information_requests set status='approved',approved_by=actor,approved_at=now(),
   redaction_notes=nullif(btrim(p_redaction_notes),''),updated_at=now() where id=r.id;
 else
  if not r.sensitive_scope or r.status<>'approved' or r.approved_by is null
   or r.second_reviewed_by is not null or actor=r.approved_by then
   raise exception 'Sensitive-scope approval requires a distinct second Records Officer.';
  end if;
  update public.release_information_requests set second_reviewed_by=actor,second_reviewed_at=now(),
   redaction_notes=coalesce(nullif(btrim(p_redaction_notes),''),redaction_notes),updated_at=now() where id=r.id;
 end if;
end $$;
revoke all on function public.approve_release_information_request(uuid,text,boolean) from public,anon;
grant execute on function public.approve_release_information_request(uuid,text,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
