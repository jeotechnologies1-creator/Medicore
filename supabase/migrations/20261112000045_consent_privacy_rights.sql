begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table if not exists public.privacy_notice_versions (
  document_type text not null check(document_type in ('privacy_notice','terms')),
  version text not null,
  document_path text not null,
  draft boolean not null default true,
  active boolean not null default false,
  published_at timestamptz,
  primary key(document_type,version),
  check(not active or published_at is not null)
);
insert into public.privacy_notice_versions(document_type,version,document_path,draft,active,published_at) values
 ('privacy_notice','draft-2026-11-12-v1','/privacy-notice.html',true,true,now()),
 ('terms','draft-2026-11-12-v1','/terms.html',true,true,now())
on conflict(document_type,version) do update set document_path=excluded.document_path;
alter table public.privacy_notice_versions enable row level security;
revoke all on public.privacy_notice_versions from public,anon,authenticated;
grant select,insert,update,delete on public.privacy_notice_versions to service_role;
drop trigger if exists audit_privacy_notice_versions on public.privacy_notice_versions;
create trigger audit_privacy_notice_versions after insert or update or delete on public.privacy_notice_versions for each row execute function public.audit_row_change();

create table if not exists public.privacy_notice_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  privacy_notice_version text not null,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  unique(profile_id,privacy_notice_version,terms_version)
);
alter table public.privacy_notice_acceptances enable row level security;
revoke all on public.privacy_notice_acceptances from public,anon,authenticated;
grant select on public.privacy_notice_acceptances to authenticated;
drop policy if exists "users read own notice acceptance" on public.privacy_notice_acceptances;
create policy "users read own notice acceptance" on public.privacy_notice_acceptances for select to authenticated
using(profile_id=(select p.id from public.profiles p where p.auth_user_id=auth.uid() and p.status::text='active' limit 1));
drop trigger if exists audit_privacy_notice_acceptances on public.privacy_notice_acceptances;
create trigger audit_privacy_notice_acceptances after insert or update or delete on public.privacy_notice_acceptances for each row execute function public.audit_row_change();

create or replace function public.record_privacy_notice_acceptance(p_privacy_version text,p_terms_version text)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare v_profile_id uuid; accepted timestamptz;
begin
  select id into v_profile_id from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if v_profile_id is null then raise exception 'An active application profile is required'; end if;
  if not exists(select 1 from public.privacy_notice_versions where document_type='privacy_notice' and version=p_privacy_version and active)
    or not exists(select 1 from public.privacy_notice_versions where document_type='terms' and version=p_terms_version and active) then
    raise exception 'The privacy notice or terms version is not current';
  end if;
  insert into public.privacy_notice_acceptances(profile_id,privacy_notice_version,terms_version)
    values(v_profile_id,p_privacy_version,p_terms_version) on conflict(profile_id,privacy_notice_version,terms_version) do nothing;
  select accepted_at into accepted from public.privacy_notice_acceptances where profile_id=v_profile_id
    and privacy_notice_version=p_privacy_version and terms_version=p_terms_version;
  return accepted;
end $$;
revoke all on function public.record_privacy_notice_acceptance(text,text) from public,anon;
grant execute on function public.record_privacy_notice_acceptance(text,text) to authenticated;

alter table public.patient_consents drop constraint if exists patient_consents_consent_type_check;
alter table public.patient_consents add constraint patient_consents_consent_type_check
  check(consent_type in ('treatment','privacy','data_sharing','portal','procedure','telehealth','research'));
alter table public.patient_consents add column if not exists consent_version text not null default 'legacy-unversioned';
alter table public.patient_consents add column if not exists witness_name text;
alter table public.patient_consents add column if not exists withdrawn_at timestamptz;
alter table public.patient_consents add column if not exists withdrawn_by uuid references public.profiles(id) on delete set null;

create or replace function public.record_patient_consent(p_patient_id uuid,p_consent_type text,p_status text,p_version text,p_witness text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; actor_role text; consent_id uuid; own_patient uuid;
begin
  select id,role::text,patient_id into actor,actor_role,own_patient from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor is null then raise exception 'Active profile required'; end if;
  if p_consent_type not in ('treatment','data_sharing','portal','procedure') or p_status not in ('granted','declined','withdrawn')
    or nullif(btrim(p_version),'') is null then raise exception 'Consent type, status, and version are required'; end if;
  if actor_role='patient' then
    if own_patient is distinct from p_patient_id or p_status not in ('granted','declined','withdrawn') then raise exception 'Patient may only manage their own consent'; end if;
  elsif not public.has_any_role(array['super_admin','doctor','nurse'])
    or not public.has_clinical_department_permission(p_patient_id,null,'consent.manage',false) then
    raise exception 'Consent management permission denied';
  end if;
  insert into public.patient_consents(patient_id,consent_type,status,granted_at,recorded_by,consent_version,witness_name,withdrawn_at,withdrawn_by,notes)
  values(p_patient_id,p_consent_type,p_status,case when p_status='granted' then now() else null end,actor,btrim(p_version),nullif(btrim(p_witness),''),
    case when p_status='withdrawn' then now() else null end,case when p_status='withdrawn' then actor else null end,nullif(btrim(p_notes),'')) returning id into consent_id;
  insert into public.patient_access_logs(patient_id,actor_id,action,purpose,source) values(p_patient_id,actor,'consent_change','consent_capture','record_patient_consent');
  return consent_id;
end $$;
revoke all on function public.record_patient_consent(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.record_patient_consent(uuid,text,text,text,text,text) to authenticated;

create or replace function public.read_patient_consents(p_patient_id uuid)
returns setof public.patient_consents language plpgsql security definer set search_path=public as $$
declare actor uuid; row_consent public.patient_consents%rowtype;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor is null or (not public.can_read_patient_record(p_patient_id) and not exists(select 1 from public.profiles where id=actor and patient_id=p_patient_id))
    or not public.has_patient_facility_access(p_patient_id) then raise exception 'Consent read access denied'; end if;
  insert into public.patient_access_logs(patient_id,actor_id,action,purpose,source) values(p_patient_id,actor,'read','patient_consents','read_patient_consents');
  for row_consent in select * from public.patient_consents where patient_id=p_patient_id order by created_at desc loop return next row_consent; end loop;
end $$;
revoke all on function public.read_patient_consents(uuid) from public,anon;
grant execute on function public.read_patient_consents(uuid) to authenticated;

create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete restrict,
  requester_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_type text not null check(request_type in ('access','correction','restriction')),
  description text not null check(length(btrim(description))>=10),
  status text not null default 'received' check(status in ('received','identity_review','in_progress','completed','declined','withdrawn')),
  received_at timestamptz not null default now(),
  due_at timestamptz not null,
  due_date_basis text not null default 'provisional_configuration_pending_legal_review',
  assigned_to uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index if not exists data_subject_requests_due_idx on public.data_subject_requests(status,due_at);
create table if not exists public.disclosure_register (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  disclosed_to text not null,
  purpose text not null,
  data_categories text[] not null,
  authority text not null,
  disclosed_by uuid not null references public.profiles(id) on delete restrict,
  disclosed_at timestamptz not null default now(),
  request_id uuid references public.data_subject_requests(id) on delete restrict,
  notes text
);
create index if not exists disclosure_register_patient_idx on public.disclosure_register(patient_id,disclosed_at desc);

create table if not exists public.retention_schedule (
  id uuid primary key default gen_random_uuid(),
  record_category text not null unique,
  retention_days integer not null check(retention_days>0),
  retention_basis text not null,
  approved boolean not null default false,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  check(not approved or (approved_by is not null and approved_at is not null))
);
create table if not exists public.legal_holds (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete restrict,
  record_category text,
  reason text not null check(length(btrim(reason))>=10),
  status text not null default 'active' check(status in ('active','released')),
  placed_by uuid not null references public.profiles(id) on delete restrict,
  placed_at timestamptz not null default now(),
  released_by uuid references public.profiles(id) on delete restrict,
  released_at timestamptz,
  check((patient_id is not null or record_category is not null)),
  check((status='active' and released_by is null and released_at is null) or (status='released' and released_by is not null and released_at is not null))
);
create table if not exists public.retention_action_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete restrict,
  record_category text not null,
  record_id text not null,
  action text not null check(action in ('archive','dispose')),
  reason text not null check(length(btrim(reason))>=10),
  status text not null default 'pending' check(status in ('pending','approved','rejected','blocked_by_legal_hold')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  decision_note text,
  disposition text not null default 'metadata_only_no_physical_deletion'
);

create table if not exists public.breach_register (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null references public.profiles(id) on delete restrict,
  discovered_at timestamptz not null,
  reported_at timestamptz not null default now(),
  summary text not null check(length(btrim(summary))>=10),
  affected_data text[] not null default '{}',
  affected_people_estimate integer check(affected_people_estimate is null or affected_people_estimate>=0),
  containment_actions text,
  risk_assessment text,
  regulator_notification_deadline timestamptz,
  notification_deadline_basis text not null default 'pending_legal_confirmation',
  status text not null default 'reported' check(status in ('reported','assessing','contained','notified','closed')),
  closed_at timestamptz
);

do $$ declare t text; begin
  foreach t in array array['data_subject_requests','disclosure_register','retention_schedule','legal_holds','retention_action_requests','breach_register'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
    execute format('drop trigger if exists audit_%I on public.%I',t,t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',t,t);
  end loop;
end $$;
revoke insert,update,delete on public.patient_consents from anon,authenticated;
grant select on public.patient_consents to authenticated;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='patient_consents' and permissive='PERMISSIVE' and cmd in ('SELECT','ALL') loop
    execute format('drop policy if exists %I on public.patient_consents',p.policyname);
  end loop;
end $$;
create policy "staff or patient read consents" on public.patient_consents for select to authenticated using(
  public.has_patient_facility_access(patient_id) and (public.can_read_patient_record(patient_id) or exists(select 1 from public.profiles where auth_user_id=auth.uid() and patient_id=patient_consents.patient_id))
);

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

create or replace function public.list_my_data_subject_requests()
returns setof public.data_subject_requests language plpgsql security definer set search_path=public as $$
declare actor uuid; req public.data_subject_requests%rowtype;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor is null then raise exception 'Active profile required'; end if;
  for req in select * from public.data_subject_requests where requester_profile_id=actor order by created_at desc loop return next req; end loop;
end $$;
revoke all on function public.list_my_data_subject_requests() from public,anon;
grant execute on function public.list_my_data_subject_requests() to authenticated;

create or replace function public.list_data_subject_request_queue()
returns setof public.data_subject_requests language plpgsql security definer set search_path=public as $$
declare actor uuid; req public.data_subject_requests%rowtype;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
  if actor is null then raise exception 'Data-subject request queue access denied'; end if;
  for req in select * from public.data_subject_requests where status not in ('completed','declined','withdrawn') order by due_at loop return next req; end loop;
end $$;
revoke all on function public.list_data_subject_request_queue() from public,anon;
grant execute on function public.list_data_subject_request_queue() to authenticated;

create or replace function public.record_disclosure(p_patient_id uuid,p_disclosed_to text,p_purpose text,p_categories text[],p_authority text,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; disclosure_id uuid;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor is null or not public.has_any_role(array['super_admin','records_officer']) or not public.has_patient_facility_access(p_patient_id)
    or nullif(btrim(p_disclosed_to),'') is null or nullif(btrim(p_purpose),'') is null or coalesce(array_length(p_categories,1),0)=0 or nullif(btrim(p_authority),'') is null then
    raise exception 'Disclosure recording permission and required details are missing';
  end if;
  insert into public.disclosure_register(patient_id,disclosed_to,purpose,data_categories,authority,disclosed_by,notes)
  values(p_patient_id,btrim(p_disclosed_to),btrim(p_purpose),p_categories,btrim(p_authority),actor,nullif(btrim(p_notes),'')) returning id into disclosure_id;
  insert into public.patient_access_logs(patient_id,actor_id,action,purpose,source) values(p_patient_id,actor,'disclosure','disclosure_register','record_disclosure');
  return disclosure_id;
end $$;
revoke all on function public.record_disclosure(uuid,text,text,text[],text,text) from public,anon;
grant execute on function public.record_disclosure(uuid,text,text,text[],text,text) to authenticated;

create or replace function public.request_retention_action(p_patient_id uuid,p_record_category text,p_record_id text,p_action text,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; request_id uuid;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text='super_admin' limit 1;
  if actor is null then raise exception 'Super Admin approval workflow access is required'; end if;
  if p_action not in ('archive','dispose') or nullif(btrim(p_record_category),'') is null or nullif(btrim(p_record_id),'') is null or length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Valid retention action and reason are required'; end if;
  if exists(select 1 from public.legal_holds h where h.status='active' and (h.patient_id=p_patient_id or h.patient_id is null)
    and (h.record_category is null or h.record_category=p_record_category)) then raise exception 'Active legal hold blocks retention action'; end if;
  insert into public.retention_action_requests(patient_id,record_category,record_id,action,reason,requested_by)
  values(p_patient_id,p_record_category,p_record_id,p_action,btrim(p_reason),actor) returning id into request_id;
  return request_id;
end $$;
revoke all on function public.request_retention_action(uuid,text,text,text,text) from public,anon;
grant execute on function public.request_retention_action(uuid,text,text,text,text) to authenticated;

create or replace function public.approve_retention_action(p_request_id uuid,p_approve boolean,p_note text)
returns text language plpgsql security definer set search_path=public as $$
declare actor uuid; req public.retention_action_requests%rowtype; actor_email text; configured_officer uuid;
begin
  select id,email into actor,actor_email from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor is null then raise exception 'Active profile required'; end if;
  begin select (setting_value#>>'{}')::uuid into configured_officer from public.system_settings where setting_key='privacy_officer_profile_id'; exception when others then configured_officer:=null; end;
  if not public.has_any_role(array['super_admin']) and configured_officer is distinct from actor then raise exception 'Retention approval authority denied'; end if;
  select * into req from public.retention_action_requests where id=p_request_id and status='pending' for update;
  if not found then raise exception 'Retention request is unavailable'; end if;
  if req.requested_by=actor then raise exception 'Retention approval must be performed by a different authorized person'; end if;
  if p_approve and req.action='dispose' and req.record_category in ('encounters','appointments','lab_orders','radiology_orders','prescriptions','vital_signs','consultations','patient_documents','immunizations','medication_administrations','patient_allergies','patient_conditions','medication_orders','care_plans','clinical_tasks','patient_consents','clinical_alerts','encounter_workflow_events','admissions','surgeries','nursing_notes','emergency_visits','intake_output_records','pain_assessments') then
    raise exception 'Clinical records cannot be physically disposed of; archive or retain them';
  end if;
  if p_approve and exists(select 1 from public.legal_holds h where h.status='active' and (h.patient_id=req.patient_id or h.patient_id is null)
    and (h.record_category is null or h.record_category=req.record_category)) then raise exception 'Active legal hold blocks approval'; end if;
  update public.retention_action_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_by=actor,decided_at=now(),decision_note=nullif(btrim(p_note),'') where id=req.id;
  return case when p_approve then 'approved_metadata_only' else 'rejected' end;
end $$;
revoke all on function public.approve_retention_action(uuid,boolean,text) from public,anon;
grant execute on function public.approve_retention_action(uuid,boolean,text) to authenticated;

create or replace function public.update_data_subject_request(p_request_id uuid,p_status text,p_assigned_to uuid,p_resolution_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('super_admin','records_officer') limit 1;
  if actor is null or p_status not in ('identity_review','in_progress','completed','declined') then raise exception 'Request workflow permission denied or invalid status'; end if;
  if p_assigned_to is not null and not exists(select 1 from public.profiles where id=p_assigned_to and status::text='active' and role::text in ('super_admin','records_officer')) then raise exception 'Assignee must be an active privacy-workflow staff member'; end if;
  update public.data_subject_requests set status=p_status,assigned_to=coalesce(p_assigned_to,assigned_to),resolution_note=nullif(btrim(p_resolution_note),''),
    resolved_at=case when p_status in ('completed','declined') then now() else null end where id=p_request_id and status not in ('completed','declined','withdrawn');
  if not found then raise exception 'Data-subject request is unavailable or already closed'; end if;
end $$;
revoke all on function public.update_data_subject_request(uuid,text,uuid,text) from public,anon;
grant execute on function public.update_data_subject_request(uuid,text,uuid,text) to authenticated;

create or replace function public.place_legal_hold(p_patient_id uuid,p_record_category text,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; hold_id uuid;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text='super_admin' limit 1;
  if actor is null or (p_patient_id is null and nullif(btrim(p_record_category),'') is null) or length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Legal hold authority, scope, and reason are required'; end if;
  insert into public.legal_holds(patient_id,record_category,reason,placed_by) values(p_patient_id,nullif(btrim(p_record_category),''),btrim(p_reason),actor) returning id into hold_id;
  return hold_id;
end $$;
revoke all on function public.place_legal_hold(uuid,text,text) from public,anon;
grant execute on function public.place_legal_hold(uuid,text,text) to authenticated;

create or replace function public.release_legal_hold(p_hold_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; hold record; officer uuid;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  begin select (setting_value#>>'{}')::uuid into officer from public.system_settings where setting_key='privacy_officer_profile_id'; exception when others then officer:=null; end;
  if actor is null or (not public.has_any_role(array['super_admin']) and officer is distinct from actor) or length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Legal hold release approval denied or reason is missing'; end if;
  update public.legal_holds set status='released',released_by=actor,released_at=now(),reason=reason||E'\nRelease: '||btrim(p_reason) where id=p_hold_id and status='active' and placed_by<>actor;
  if not found then raise exception 'Active legal hold not found'; end if;
end $$;
revoke all on function public.release_legal_hold(uuid,text) from public,anon;
grant execute on function public.release_legal_hold(uuid,text) to authenticated;

create or replace function public.approve_retention_schedule(p_schedule_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; officer uuid;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  begin select (setting_value#>>'{}')::uuid into officer from public.system_settings where setting_key='privacy_officer_profile_id'; exception when others then officer:=null; end;
  if actor is null or (not public.has_any_role(array['super_admin']) and officer is distinct from actor) then raise exception 'Retention schedule approval denied'; end if;
  update public.retention_schedule set approved=true,approved_by=actor,approved_at=now() where id=p_schedule_id and not approved;
  if not found then raise exception 'Unapproved retention schedule entry not found'; end if;
end $$;
revoke all on function public.approve_retention_schedule(uuid) from public,anon;
grant execute on function public.approve_retention_schedule(uuid) to authenticated;

create or replace function public.report_privacy_breach(p_discovered_at timestamptz,p_summary text,p_affected_data text[],p_estimate integer default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid; incident_id uuid;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor is null or p_discovered_at is null or length(btrim(coalesce(p_summary,'')))<10 then raise exception 'Active profile, discovery time, and incident summary are required'; end if;
  insert into public.breach_register(reported_by,discovered_at,summary,affected_data,affected_people_estimate)
  values(actor,p_discovered_at,btrim(p_summary),coalesce(p_affected_data,'{}'),p_estimate) returning id into incident_id;
  return incident_id;
end $$;
revoke all on function public.report_privacy_breach(timestamptz,text,text[],integer) from public,anon;
grant execute on function public.report_privacy_breach(timestamptz,text,text[],integer) to authenticated;

insert into public.system_settings(setting_key,setting_value) values('data_subject_request_due_days','30'::jsonb)
on conflict(setting_key) do nothing;

commit;
notify pgrst,'reload schema';
