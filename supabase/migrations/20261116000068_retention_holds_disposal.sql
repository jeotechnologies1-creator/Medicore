begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Evolve the existing privacy retention schedule into a facility-scoped,
-- versioned policy. A missing day count means the schedule is not usable.
alter table public.retention_schedule add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table public.retention_schedule add column if not exists version integer not null default 1 check(version>0);
alter table public.retention_schedule add column if not exists active boolean not null default true;
alter table public.retention_schedule add column if not exists configured_by uuid references public.profiles(id);
alter table public.retention_schedule alter column retention_days drop not null;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.retention_schedule'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%retention_days%' loop
  execute format('alter table public.retention_schedule drop constraint %I',c.conname);
 end loop;
 for c in select conname from pg_constraint where conrelid='public.retention_schedule'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (record_category)' loop
  execute format('alter table public.retention_schedule drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.retention_schedule drop constraint if exists retention_schedule_days_valid;
alter table public.retention_schedule add constraint retention_schedule_days_valid check(retention_days is null or retention_days>0);
create unique index if not exists retention_schedule_version_scope on public.retention_schedule(coalesce(facility_id,'00000000-0000-0000-0000-000000000000'::uuid),record_category,version);
create unique index if not exists retention_schedule_active_scope on public.retention_schedule(coalesce(facility_id,'00000000-0000-0000-0000-000000000000'::uuid),record_category) where active;

alter table public.legal_holds add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table public.legal_holds add column if not exists case_reference text;
alter table public.legal_holds add column if not exists authority_basis text;
create unique index if not exists legal_hold_case_reference_unique on public.legal_holds(facility_id,case_reference) where case_reference is not null;

alter table public.retention_action_requests add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table public.retention_action_requests add column if not exists schedule_id uuid references public.retention_schedule(id) on delete restrict;
alter table public.retention_action_requests add column if not exists schedule_version integer;
alter table public.retention_action_requests add column if not exists record_fingerprint text;
alter table public.retention_action_requests add column if not exists first_approved_by uuid references public.profiles(id);
alter table public.retention_action_requests add column if not exists first_approved_at timestamptz;
alter table public.retention_action_requests add column if not exists second_approved_by uuid references public.profiles(id);
alter table public.retention_action_requests add column if not exists second_approved_at timestamptz;
alter table public.retention_action_requests drop constraint if exists retention_action_request_second_approver_distinct;
alter table public.retention_action_requests add constraint retention_action_request_second_approver_distinct
 check(second_approved_by is null or (second_approved_by<>requested_by and second_approved_by is distinct from first_approved_by));
alter table public.retention_action_requests drop constraint if exists retention_action_requests_status_check;
alter table public.retention_action_requests add constraint retention_action_requests_status_check
 check(status in ('pending','first_approved','approved','rejected','blocked_by_legal_hold','executed'));
alter table public.retention_action_requests alter column disposition set default 'pending';

create table if not exists public.record_archive_registry (
 record_category text not null, record_id text not null, facility_id uuid not null references public.facilities(id) on delete restrict,
 patient_id uuid references public.patients(id) on delete restrict, archive_state text not null check(archive_state in ('archived','sealed')),
 action_request_id uuid not null unique references public.retention_action_requests(id) on delete restrict,
 record_fingerprint text not null, state_note text, recorded_by uuid not null references public.profiles(id), recorded_at timestamptz not null default now(),
 primary key(record_category,record_id)
);
create index if not exists record_archive_facility_state on public.record_archive_registry(facility_id,archive_state,recorded_at desc);

create table if not exists public.disposal_certificates (
 id uuid primary key default gen_random_uuid(), action_request_id uuid not null unique references public.retention_action_requests(id) on delete restrict,
 record_category text not null, record_id text not null, facility_id uuid not null references public.facilities(id) on delete restrict,
 patient_id uuid references public.patients(id) on delete restrict, schedule_id uuid not null references public.retention_schedule(id) on delete restrict,
 schedule_version integer not null, record_fingerprint text not null, retention_basis text not null,
 requested_by uuid not null references public.profiles(id), first_approved_by uuid not null references public.profiles(id),
 second_approved_by uuid not null references public.profiles(id), executed_by uuid not null references public.profiles(id),
 issued_at timestamptz not null default now(), legal_hold_clearance_at timestamptz not null,
 disposition_method text not null default 'sealed_source_retained_for_linked_record_integrity',
 linked_records_preserved boolean not null default true,
 check(requested_by<>first_approved_by and requested_by<>second_approved_by and first_approved_by<>second_approved_by)
);

alter table public.record_archive_registry enable row level security;
alter table public.disposal_certificates enable row level security;
revoke all on public.record_archive_registry,public.disposal_certificates from public,anon,authenticated;
grant select on public.record_archive_registry,public.disposal_certificates to authenticated;
grant select,insert on public.record_archive_registry,public.disposal_certificates to service_role;
drop policy if exists retention_archive_read on public.record_archive_registry;
create policy retention_archive_read on public.record_archive_registry for select to authenticated using (
 public.has_any_role(array['super_admin','records_officer']) and public.has_org_permission('patient.read',facility_id,null)
);
drop policy if exists disposal_certificate_read on public.disposal_certificates;
create policy disposal_certificate_read on public.disposal_certificates for select to authenticated using (
 public.has_any_role(array['super_admin','records_officer']) and public.has_org_permission('patient.read',facility_id,null)
);
drop trigger if exists audit_record_archive_registry on public.record_archive_registry;
create trigger audit_record_archive_registry after insert on public.record_archive_registry for each row execute function public.audit_row_change();
drop trigger if exists audit_disposal_certificates on public.disposal_certificates;
create trigger audit_disposal_certificates after insert on public.disposal_certificates for each row execute function public.audit_row_change();
drop trigger if exists disposal_certificates_immutable on public.disposal_certificates;
create trigger disposal_certificates_immutable before update or delete on public.disposal_certificates for each row execute function public.prevent_consultation_history_mutation();

create or replace function public.configure_retention_schedule(p_facility_id uuid,p_record_category text,p_retention_days integer,p_retention_basis text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; next_version integer; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 if actor is null or (p_facility_id is null and not public.has_any_role(array['super_admin']))
  or (p_facility_id is not null and not public.has_org_permission('patient.read',p_facility_id,null))
  or nullif(btrim(p_record_category),'') is null or p_retention_days is not null and p_retention_days<=0
  or nullif(btrim(p_retention_basis),'') is null then raise exception 'Retention configuration requires authorized scope and a documented legal basis.'; end if;
 select coalesce(max(version),0)+1 into next_version from public.retention_schedule
  where record_category=btrim(p_record_category) and facility_id is not distinct from p_facility_id;
 update public.retention_schedule set active=false where record_category=btrim(p_record_category) and facility_id is not distinct from p_facility_id and active;
 insert into public.retention_schedule(facility_id,record_category,retention_days,retention_basis,approved,approved_by,approved_at,version,active,configured_by)
 values(p_facility_id,btrim(p_record_category),p_retention_days,btrim(p_retention_basis),false,null,null,next_version,true,actor) returning id into result;
 return result;
end $$;

create or replace function public.approve_retention_schedule(p_schedule_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; s public.retention_schedule%rowtype;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 select * into s from public.retention_schedule where id=p_schedule_id and active and not approved for update;
 if actor is null or s.id is null or s.retention_days is null or s.configured_by=actor
  or (s.facility_id is null and not public.has_any_role(array['super_admin']))
  or (s.facility_id is not null and not public.has_org_permission('patient.read',s.facility_id,null)) then
  raise exception 'Retention schedule approval requires a distinct authorized reviewer and a configured period.';
 end if;
 update public.retention_schedule set approved=true,approved_by=actor,approved_at=now() where id=s.id;
end $$;

create or replace function public.place_legal_hold_case(p_patient_id uuid,p_facility_id uuid,p_record_category text,p_case_reference text,p_reason text,p_authority_basis text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 if actor is null or (p_patient_id is null and nullif(btrim(p_record_category),'') is null)
  or (p_facility_id is not null and not public.has_org_permission('patient.read',p_facility_id,null))
  or length(btrim(coalesce(p_reason,'')))<10 or nullif(btrim(p_authority_basis),'') is null then
  raise exception 'A legal hold case requires an authorized user, scope, reason, and authority basis.';
 end if;
 insert into public.legal_holds(patient_id,facility_id,record_category,case_reference,reason,authority_basis,placed_by)
 values(p_patient_id,p_facility_id,nullif(btrim(p_record_category),''),nullif(btrim(p_case_reference),''),btrim(p_reason),btrim(p_authority_basis),actor)
 returning id into result;
 return result;
end $$;

create or replace function public.request_retention_action(p_patient_id uuid,p_record_category text,p_record_id text,p_action text,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; actor_facility uuid; patient_facility uuid; facility uuid; snapshot jsonb; fingerprint text; created timestamptz;
 schedule public.retention_schedule%rowtype; request_id uuid; held boolean;
 allowed_categories text[]:=array['admissions','encounters','consultations','prescriptions','patient_allergies','patient_conditions','lab_orders','radiology_orders','surgeries','nursing_notes','emergency_visits','intake_output_records','pain_assessments','patient_documents','patient_messages','patient_next_of_kin','medication_orders','medication_administrations','patient_consents','clinical_alerts','care_plans','clinical_tasks','appointments','billing','insurance_claims'];
begin
 select id,facility_id into actor,actor_facility from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 if actor is null or p_record_category is null or not (p_record_category=any(allowed_categories)) or p_action not in ('archive','dispose')
  or nullif(btrim(p_record_id),'') is null or length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Retention request is invalid or unauthorized.'; end if;
 if to_regclass(format('public.%I',p_record_category)) is null then raise exception 'Record type is not supported for retention processing.'; end if;
 execute format('select to_jsonb(r) from public.%I r where r.id::text=$1',p_record_category) into snapshot using p_record_id;
 if snapshot is null then raise exception 'The requested source record does not exist.'; end if;
 if p_record_category='patients' and p_patient_id is null then p_patient_id:=p_record_id::uuid; end if;
 begin patient_facility:=(snapshot->>'patient_id')::uuid; exception when invalid_text_representation then patient_facility:=null; end;
 if p_patient_id is not null and patient_facility is distinct from p_patient_id then raise exception 'Retention patient scope does not match the source record.'; end if;
 p_patient_id:=coalesce(patient_facility,p_patient_id);
 if p_patient_id is not null then select home_facility_id into facility from public.patients where id=p_patient_id; end if;
 begin facility:=coalesce(facility,(snapshot->>'facility_id')::uuid); exception when invalid_text_representation then null; end;
 facility:=coalesce(facility,actor_facility);
 if facility is null or (not public.has_any_role(array['super_admin']) and not public.has_org_permission('patient.read',facility,null)) then raise exception 'Retention facility access denied.'; end if;
 begin created:=(snapshot->>'created_at')::timestamptz; exception when invalid_text_representation then created:=null; end;
 if created is null then raise exception 'Source record has no creation timestamp; retention eligibility cannot be established.'; end if;
 select * into schedule from public.retention_schedule s where s.record_category=p_record_category and s.approved and s.active
  and s.retention_days is not null and (s.facility_id=facility or s.facility_id is null)
  order by (s.facility_id is not null) desc,s.version desc limit 1;
 if schedule.id is null then raise exception 'No legally reviewed retention schedule with a configured duration covers this record type.'; end if;
 if created+make_interval(days=>schedule.retention_days)>now() then raise exception 'Retention duration has not elapsed for this record.'; end if;
 fingerprint:=encode(digest(snapshot::text,'sha256'),'hex');
 select exists(select 1 from public.legal_holds h where h.status='active'
  and (h.patient_id is null or h.patient_id=p_patient_id) and (h.record_category is null or h.record_category=p_record_category)
  and (h.facility_id is null or h.facility_id=facility)) into held;
 insert into public.retention_action_requests(patient_id,record_category,record_id,action,reason,requested_by,facility_id,schedule_id,schedule_version,record_fingerprint,status,disposition)
 values(p_patient_id,p_record_category,btrim(p_record_id),p_action,btrim(p_reason),actor,facility,schedule.id,schedule.version,fingerprint,
  case when held then 'blocked_by_legal_hold' else 'pending' end,case when held then 'blocked_by_legal_hold' else 'pending' end) returning id into request_id;
 return request_id;
end $$;

create or replace function public.approve_retention_action(p_request_id uuid,p_approve boolean,p_note text)
returns text language plpgsql security definer set search_path=public as $$
declare actor uuid; req public.retention_action_requests%rowtype;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 select * into req from public.retention_action_requests where id=p_request_id and status='pending' for update;
 if actor is null or req.id is null or actor=req.requested_by or not public.has_org_permission('patient.read',req.facility_id,null) then
  raise exception 'Retention approval requires an independent authorized Records Officer.';
 end if;
 if not p_approve then
  update public.retention_action_requests set status='rejected',decided_by=actor,decided_at=now(),decision_note=nullif(btrim(p_note),'') where id=req.id;
  return 'rejected';
 end if;
 if exists(select 1 from public.legal_holds h where h.status='active' and (h.patient_id is null or h.patient_id=req.patient_id)
   and (h.record_category is null or h.record_category=req.record_category) and (h.facility_id is null or h.facility_id=req.facility_id)) then
  update public.retention_action_requests set status='blocked_by_legal_hold',decided_by=actor,decided_at=now(),decision_note='Active legal hold.' where id=req.id;
  return 'blocked_by_legal_hold';
 end if;
 update public.retention_action_requests set status=case when req.action='dispose' then 'first_approved' else 'approved' end,
  decided_by=actor,decided_at=now(),first_approved_by=actor,first_approved_at=now(),decision_note=nullif(btrim(p_note),'') where id=req.id;
 return case when req.action='dispose' then 'first_approved' else 'approved' end;
end $$;

create or replace function public.approve_retention_disposal(p_request_id uuid,p_approve boolean,p_note text)
returns text language plpgsql security definer set search_path=public as $$
declare actor uuid; req public.retention_action_requests%rowtype;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 select * into req from public.retention_action_requests where id=p_request_id and status='first_approved' and action='dispose' for update;
 if actor is null or req.id is null or actor in (req.requested_by,req.first_approved_by) or not public.has_org_permission('patient.read',req.facility_id,null) then
  raise exception 'A different authorized Records Officer must approve disposal.';
 end if;
 if not p_approve then
  update public.retention_action_requests set status='rejected',second_approved_by=actor,second_approved_at=now(),decision_note=nullif(btrim(p_note),'') where id=req.id;
  return 'rejected';
 end if;
 if exists(select 1 from public.legal_holds h where h.status='active' and (h.patient_id is null or h.patient_id=req.patient_id)
   and (h.record_category is null or h.record_category=req.record_category) and (h.facility_id is null or h.facility_id=req.facility_id)) then
  update public.retention_action_requests set status='blocked_by_legal_hold',second_approved_by=actor,second_approved_at=now(),decision_note='Active legal hold.' where id=req.id;
  return 'blocked_by_legal_hold';
 end if;
 update public.retention_action_requests set status='approved',second_approved_by=actor,second_approved_at=now(),decision_note=nullif(btrim(p_note),'') where id=req.id;
 return 'approved';
end $$;

create or replace function public.execute_retention_action(p_request_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare actor uuid; req public.retention_action_requests%rowtype; snapshot jsonb; current_fingerprint text; patient uuid; held boolean; archive_state text;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 select * into req from public.retention_action_requests where id=p_request_id and status='approved' for update;
 if actor is null or req.id is null or not public.has_org_permission('patient.read',req.facility_id,null) then raise exception 'Approved retention action is not available.'; end if;
 if req.action='dispose' and (req.first_approved_by is null or req.second_approved_by is null or req.first_approved_by=req.second_approved_by
   or req.requested_by in (req.first_approved_by,req.second_approved_by)) then raise exception 'Disposal requires two independent approvers.'; end if;
 if exists(select 1 from public.legal_holds h where h.status='active' and (h.patient_id is null or h.patient_id=req.patient_id)
   and (h.record_category is null or h.record_category=req.record_category) and (h.facility_id is null or h.facility_id=req.facility_id)) then
  update public.retention_action_requests set status='blocked_by_legal_hold',decision_note='Active legal hold at execution.' where id=req.id;
  return 'blocked_by_legal_hold';
 end if;
 execute format('select to_jsonb(r) from public.%I r where r.id::text=$1',req.record_category) into snapshot using req.record_id;
 if snapshot is null then raise exception 'Retention source record no longer exists; no disposal action was executed.'; end if;
 current_fingerprint:=encode(digest(snapshot::text,'sha256'),'hex');
 if current_fingerprint is distinct from req.record_fingerprint then raise exception 'Source record changed after retention request; submit a new request for review.'; end if;
 begin patient:=(snapshot->>'patient_id')::uuid; exception when invalid_text_representation then patient:=null; end;
 archive_state:=case when req.action='dispose' then 'sealed' else 'archived' end;
 if exists(select 1 from public.record_archive_registry a where a.record_category=req.record_category and a.record_id=req.record_id) then
  if req.action<>'dispose' or not exists(select 1 from public.record_archive_registry a where a.record_category=req.record_category and a.record_id=req.record_id and a.archive_state='archived') then
   raise exception 'This record already has an archive or disposal state.';
  end if;
  update public.record_archive_registry set archive_state='sealed',action_request_id=req.id,record_fingerprint=current_fingerprint,
   state_note='Source retained and sealed under approved disposal to preserve linked-record integrity.',recorded_by=actor,recorded_at=now()
   where record_category=req.record_category and record_id=req.record_id and archive_state='archived';
 else
  insert into public.record_archive_registry(record_category,record_id,facility_id,patient_id,archive_state,action_request_id,record_fingerprint,state_note,recorded_by)
  values(req.record_category,req.record_id,req.facility_id,patient,archive_state,req.id,current_fingerprint,
   'Archived under approved retention workflow; source record retained.',actor);
 end if;
 if req.action='dispose' then
  insert into public.disposal_certificates(action_request_id,record_category,record_id,facility_id,patient_id,schedule_id,schedule_version,record_fingerprint,
   retention_basis,requested_by,first_approved_by,second_approved_by,executed_by,legal_hold_clearance_at)
  values(req.id,req.record_category,req.record_id,req.facility_id,patient,req.schedule_id,req.schedule_version,current_fingerprint,
   (select retention_basis from public.retention_schedule where id=req.schedule_id),req.requested_by,req.first_approved_by,req.second_approved_by,actor,now());
 end if;
 update public.retention_action_requests set status='executed',decided_by=actor,decided_at=now(),
  disposition=case when req.action='dispose' then 'sealed_source_retained_certificate_issued' else 'archived_source_retained' end where id=req.id;
 return archive_state;
end $$;

create or replace function public.prevent_clinical_hard_delete() returns trigger language plpgsql as $$
begin
 raise exception 'Hard deletion of clinical records is blocked; use the approved retention workflow to archive or seal linked records.';
end $$;
do $$ declare t text; begin
 foreach t in array array['patients','admissions','encounters','consultations','prescriptions','patient_allergies','patient_conditions','lab_orders','radiology_orders','surgeries','nursing_notes','emergency_visits','intake_output_records','pain_assessments','patient_documents','patient_messages','patient_next_of_kin','medication_orders','medication_administrations','patient_consents','clinical_alerts','care_plans','clinical_tasks','appointments'] loop
  if to_regclass(format('public.%I',t)) is not null and not exists(select 1 from pg_trigger where tgrelid=to_regclass(format('public.%I',t)) and tgname='retention_hard_delete_block') then
   execute format('create trigger retention_hard_delete_block before delete on public.%I for each row execute function public.prevent_clinical_hard_delete()',t);
  end if;
 end loop;
end $$;

revoke all on function public.configure_retention_schedule(uuid,text,integer,text),public.place_legal_hold_case(uuid,uuid,text,text,text,text),
 public.request_retention_action(uuid,text,text,text,text),public.approve_retention_action(uuid,boolean,text),public.approve_retention_disposal(uuid,boolean,text),
 public.execute_retention_action(uuid),public.prevent_clinical_hard_delete() from public,anon;
grant execute on function public.configure_retention_schedule(uuid,text,integer,text),public.place_legal_hold_case(uuid,uuid,text,text,text,text),
 public.request_retention_action(uuid,text,text,text,text),public.approve_retention_action(uuid,boolean,text),public.approve_retention_disposal(uuid,boolean,text),
 public.execute_retention_action(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
