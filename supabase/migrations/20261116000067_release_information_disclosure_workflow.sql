begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- The existing privacy migration owns the disclosure register and patient
-- access-request queue. Extend those audited records rather than duplicating them.
alter table public.disclosure_register add column if not exists release_request_id uuid;
alter table public.disclosure_register add column if not exists requester_relationship text;
alter table public.disclosure_register add column if not exists released_scope text[];
alter table public.disclosure_register add column if not exists redaction_notes text;

create table public.release_information_requests (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict,
 requester_name text not null check(length(btrim(requester_name))>0), requester_contact text,
 requester_relationship text not null check(length(btrim(requester_relationship))>0), purpose text not null check(length(btrim(purpose))>0),
 requested_scope text[] not null check(cardinality(requested_scope)>0), sensitive_scope boolean not null default false,
 status text not null default 'received' check(status in ('received','verified','approved','released','denied','withdrawn')),
 identity_verified_by uuid references public.profiles(id), identity_verified_at timestamptz, identity_method text, identity_notes text,
 authorization_verified_by uuid references public.profiles(id), authorization_verified_at timestamptz, authorization_basis text,
 approved_by uuid references public.profiles(id), approved_at timestamptz, second_reviewed_by uuid references public.profiles(id), second_reviewed_at timestamptz,
 redaction_notes text, denied_by uuid references public.profiles(id), denial_reason text, denied_at timestamptz,
 released_by uuid references public.profiles(id), released_at timestamptz,
 received_by uuid not null references public.profiles(id), received_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((identity_verified_by is null)=(identity_verified_at is null)),
 check((authorization_verified_by is null)=(authorization_verified_at is null)),
 check((approved_by is null)=(approved_at is null)),
 check((second_reviewed_by is null)=(second_reviewed_at is null)),
 check((released_by is null)=(released_at is null)),
 check((denied_by is null)=(denied_at is null))
);
alter table public.disclosure_register add constraint disclosure_register_release_request_fkey
 foreign key(release_request_id) references public.release_information_requests(id) on delete restrict;
create unique index release_information_disclosure_unique on public.disclosure_register(release_request_id) where release_request_id is not null;
create index release_information_queue_idx on public.release_information_requests(facility_id,status,received_at desc);
create index release_information_patient_idx on public.release_information_requests(patient_id,received_at desc);

create table public.data_subject_deadline_policies (
 id uuid primary key default gen_random_uuid(), facility_id uuid references public.facilities(id) on delete restrict,
 request_type text not null check(request_type in ('access','correction','restriction')),
 due_days integer check(due_days is null or due_days>0), deadline_basis text not null check(length(btrim(deadline_basis))>0),
 active boolean not null default true, configured_by uuid not null references public.profiles(id), configured_at timestamptz not null default now(),
 unique nulls not distinct(facility_id,request_type)
);
create index data_subject_deadline_policy_scope on public.data_subject_deadline_policies(facility_id,request_type) where active;
alter table public.data_subject_requests alter column due_at drop not null;
alter table public.data_subject_requests alter column due_date_basis set default 'pending_legal_review';
alter table public.data_subject_requests add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
alter table public.data_subject_requests add column if not exists identity_verified_by uuid references public.profiles(id);
alter table public.data_subject_requests add column if not exists identity_verified_at timestamptz;
alter table public.data_subject_requests add column if not exists identity_method text;
alter table public.data_subject_requests add column if not exists authorization_verified_by uuid references public.profiles(id);
alter table public.data_subject_requests add column if not exists authorization_verified_at timestamptz;
alter table public.data_subject_requests add column if not exists authorization_basis text;

alter table public.release_information_requests enable row level security;
alter table public.data_subject_deadline_policies enable row level security;
revoke all on public.release_information_requests,public.data_subject_deadline_policies from public,anon,authenticated;
grant select on public.release_information_requests,public.data_subject_deadline_policies to authenticated;
grant select,insert,update on public.release_information_requests,public.data_subject_deadline_policies to service_role;
create policy release_information_read on public.release_information_requests for select to authenticated using (
 public.has_any_role(array['super_admin','records_officer']) and public.has_patient_facility_access(patient_id)
);
create policy data_subject_deadline_policy_read on public.data_subject_deadline_policies for select to authenticated using (
 public.has_any_role(array['super_admin','records_officer']) and (facility_id is null or public.has_org_permission('patient.read',facility_id,null))
);
create trigger audit_release_information_requests after insert or update on public.release_information_requests for each row execute function public.audit_row_change();
create trigger audit_data_subject_deadline_policies after insert or update on public.data_subject_deadline_policies for each row execute function public.audit_row_change();

create or replace function public.guard_data_subject_request_verification() returns trigger language plpgsql as $$
begin
 if new.status='completed' and (new.identity_verified_at is null or new.authorization_verified_at is null) then
  raise exception 'A patient request cannot be completed before identity and authorization are verified.';
 end if;
 return new;
end $$;
create trigger data_subject_request_verification_guard before update on public.data_subject_requests for each row execute function public.guard_data_subject_request_verification();

create or replace function public.intake_release_information_request(p_patient_id uuid,p_requester_name text,p_requester_contact text,p_relationship text,p_purpose text,p_scope text[],p_sensitive boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; facility uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 select home_facility_id into facility from public.patients where id=p_patient_id;
 if facility is null then select facility_id into facility from public.profiles where id=actor; end if;
 if actor is null or facility is null or not public.has_patient_facility_access(p_patient_id) or nullif(btrim(p_requester_name),'') is null
   or nullif(btrim(p_relationship),'') is null or nullif(btrim(p_purpose),'') is null or coalesce(cardinality(p_scope),0)=0
   or exists(select 1 from unnest(p_scope) s where s is null or nullif(btrim(s),'') is null) then
  raise exception 'Release request intake requires records authority, facility access, requester relationship, purpose, and scope.';
 end if;
 insert into public.release_information_requests(patient_id,facility_id,requester_name,requester_contact,requester_relationship,purpose,requested_scope,sensitive_scope,received_by)
 values(p_patient_id,facility,btrim(p_requester_name),nullif(btrim(p_requester_contact),''),btrim(p_relationship),btrim(p_purpose),p_scope,p_sensitive,actor)
 returning id into result;
 insert into public.patient_access_logs(patient_id,actor_id,action,purpose,source) values(p_patient_id,actor,'read','release_information_request','intake_release_information_request');
 return result;
end $$;

create or replace function public.verify_release_information_request(p_request_id uuid,p_identity_method text,p_identity_notes text,p_authorization_basis text)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; r public.release_information_requests%rowtype;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 select * into r from public.release_information_requests where id=p_request_id for update;
 if actor is null or r.id is null or r.status<>'received' or not public.has_patient_facility_access(r.patient_id)
   or nullif(btrim(p_identity_method),'') is null or nullif(btrim(p_authorization_basis),'') is null then
  raise exception 'Identity and authority verification must be recorded by a Records Officer before approval.';
 end if;
 update public.release_information_requests set status='verified',identity_verified_by=actor,identity_verified_at=now(),identity_method=btrim(p_identity_method),
  identity_notes=nullif(btrim(p_identity_notes),''),authorization_verified_by=actor,authorization_verified_at=now(),authorization_basis=btrim(p_authorization_basis),updated_at=now()
 where id=r.id;
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
  if r.approved_by is not null or (r.sensitive_scope and actor= r.identity_verified_by) then
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

create or replace function public.deny_release_information_request(p_request_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; r public.release_information_requests%rowtype;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 select * into r from public.release_information_requests where id=p_request_id for update;
 if actor is null or r.id is null or r.status not in ('received','verified','approved') or nullif(btrim(p_reason),'') is null
   or not public.has_patient_facility_access(r.patient_id) then raise exception 'Release denial requires an authorized Records Officer and reason.'; end if;
 update public.release_information_requests set status='denied',denied_by=actor,denial_reason=btrim(p_reason),denied_at=now(),updated_at=now() where id=r.id;
end $$;

create or replace function public.release_information_request(p_request_id uuid,p_released_scope text[],p_redaction_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; r public.release_information_requests%rowtype; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 select * into r from public.release_information_requests where id=p_request_id for update;
 if actor is null or r.id is null or r.status<>'approved' or (r.sensitive_scope and r.second_reviewed_by is null)
   or coalesce(cardinality(p_released_scope),0)=0 or exists(select 1 from unnest(p_released_scope) s where nullif(btrim(s),'') is null)
   or not coalesce(p_released_scope <@ r.requested_scope,false)
   or not public.has_patient_facility_access(r.patient_id) then raise exception 'Release requires approval, required second review, and a subset of the authorized request scope.'; end if;
 insert into public.disclosure_register(patient_id,disclosed_to,purpose,data_categories,authority,disclosed_by,requester_relationship,
  released_scope,redaction_notes,release_request_id,notes)
 values(r.patient_id,r.requester_name,r.purpose,p_released_scope,r.authorization_basis,actor,r.requester_relationship,p_released_scope,
  coalesce(nullif(btrim(p_redaction_notes),''),r.redaction_notes),r.id,'Release request '||r.id::text) returning id into result;
 update public.release_information_requests set status='released',released_by=actor,released_at=now(),redaction_notes=coalesce(nullif(btrim(p_redaction_notes),''),redaction_notes),updated_at=now() where id=r.id;
 insert into public.patient_access_logs(patient_id,actor_id,action,purpose,source) values(r.patient_id,actor,'disclosure','disclosure_register','release_information_request');
 return result;
end $$;

create or replace function public.configure_data_subject_deadline(p_facility_id uuid,p_request_type text,p_due_days integer,p_deadline_basis text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; result uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 if actor is null or (p_facility_id is null and not public.has_any_role(array['super_admin']))
  or (p_facility_id is not null and not public.has_org_permission('patient.read',p_facility_id,null))
  or p_request_type not in ('access','correction','restriction') or p_due_days is not null and p_due_days<=0
  or nullif(btrim(p_deadline_basis),'') is null then raise exception 'Deadline configuration requires an authorized records officer, request type, and documented basis.'; end if;
 insert into public.data_subject_deadline_policies(facility_id,request_type,due_days,deadline_basis,configured_by)
 values(p_facility_id,p_request_type,p_due_days,btrim(p_deadline_basis),actor)
 on conflict(facility_id,request_type) do update set due_days=excluded.due_days,deadline_basis=excluded.deadline_basis,active=true,configured_by=excluded.configured_by,configured_at=now()
 returning id into result;
 return result;
end $$;

create or replace function public.create_data_subject_request(p_patient_id uuid,p_request_type text,p_description text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; linked_patient uuid; facility uuid; policy public.data_subject_deadline_policies%rowtype; request_id uuid;
begin
 select id,patient_id into actor,linked_patient from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
 if actor is null or p_request_type not in ('access','correction','restriction') or length(btrim(coalesce(p_description,'')))<10 then raise exception 'Active profile, supported request type, and description are required'; end if;
 if p_patient_id is not null and linked_patient is distinct from p_patient_id and not public.has_patient_facility_access(p_patient_id) then raise exception 'Patient request scope denied'; end if;
 p_patient_id:=coalesce(p_patient_id,linked_patient);
 select home_facility_id into facility from public.patients where id=p_patient_id;
 select * into policy from public.data_subject_deadline_policies d where d.active and d.request_type=p_request_type
  and (d.facility_id=facility or d.facility_id is null) order by (d.facility_id is not null) desc limit 1;
 insert into public.data_subject_requests(patient_id,requester_profile_id,request_type,description,status,due_at,due_date_basis,facility_id)
 values(p_patient_id,actor,p_request_type,btrim(p_description),'received',case when policy.id is null or policy.due_days is null then null else now()+make_interval(days=>policy.due_days) end,
  coalesce(policy.deadline_basis,'pending_legal_review'),facility) returning id into request_id;
 return request_id;
end $$;

create or replace function public.verify_data_subject_request(p_request_id uuid,p_identity_method text,p_authorization_basis text)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; r public.data_subject_requests%rowtype;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
 select * into r from public.data_subject_requests where id=p_request_id for update;
 if actor is null or r.id is null or r.status not in ('received','identity_review') or nullif(btrim(p_identity_method),'') is null or nullif(btrim(p_authorization_basis),'') is null then
  raise exception 'Patient request identity and authorization verification require an authorized Records Officer.';
 end if;
 update public.data_subject_requests set status='in_progress',identity_verified_by=actor,identity_verified_at=now(),identity_method=btrim(p_identity_method),
  authorization_verified_by=actor,authorization_verified_at=now(),authorization_basis=btrim(p_authorization_basis) where id=r.id;
end $$;

revoke all on function public.intake_release_information_request(uuid,text,text,text,text,text[],boolean),public.verify_release_information_request(uuid,text,text,text),
 public.approve_release_information_request(uuid,text,boolean),public.deny_release_information_request(uuid,text),public.release_information_request(uuid,text[],text),
 public.configure_data_subject_deadline(uuid,text,integer,text),public.verify_data_subject_request(uuid,text,text) from public,anon;
grant execute on function public.intake_release_information_request(uuid,text,text,text,text,text[],boolean),public.verify_release_information_request(uuid,text,text,text),
 public.approve_release_information_request(uuid,text,boolean),public.deny_release_information_request(uuid,text),public.release_information_request(uuid,text[],text),
 public.configure_data_subject_deadline(uuid,text,integer,text),public.verify_data_subject_request(uuid,text,text),public.create_data_subject_request(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
