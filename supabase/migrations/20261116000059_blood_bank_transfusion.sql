begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

insert into public.permission_catalog(permission_key,description,sensitive) values
 ('bloodbank.manage','Manage blood bank inventory and unit lifecycle',true),
 ('bloodbank.crossmatch','Request and record blood crossmatches',true),
 ('bloodbank.transfuse','Verify and document transfusions',true),
 ('bloodbank.rules.review','Review facility compatibility rules',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=excluded.sensitive;
insert into public.role_permission_grants(role,permission_key,scope) values
 ('laboratory_scientist','bloodbank.manage','department'),('laboratory_scientist','bloodbank.crossmatch','department'),
 ('doctor','bloodbank.crossmatch','department'),('doctor','bloodbank.transfuse','department'),
 ('nurse','bloodbank.crossmatch','department'),('nurse','bloodbank.transfuse','department') on conflict do nothing;

create table if not exists public.blood_bank_clinical_owners(
 facility_id uuid primary key references public.facilities(id) on delete restrict,
 profile_id uuid not null references public.profiles(id) on delete restrict,
 assigned_by uuid not null references public.profiles(id) on delete restrict,assigned_at timestamptz not null default now());
create table if not exists public.blood_bank_witness_credentials(
 profile_id uuid primary key references public.profiles(id) on delete cascade,
 pin_hash text not null,updated_at timestamptz not null default now());

create table if not exists public.blood_donors(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 donor_number text not null,patient_id uuid references public.patients(id) on delete restrict,
 created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),
 unique(facility_id,donor_number));
create table if not exists public.blood_units(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 donor_id uuid not null references public.blood_donors(id) on delete restrict,unit_number text not null,
 component_type text not null check(length(btrim(component_type))>0),blood_group text not null check(length(btrim(blood_group))>0),
 expires_at timestamptz not null,created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),
 unique(facility_id,unit_number));
create table if not exists public.blood_compatibility_rules(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 rule_version integer not null check(rule_version>0),component_type text not null,donor_group text not null,recipient_group text not null,
 compatible boolean not null,clinical_owner_id uuid not null references public.profiles(id) on delete restrict,
 reviewed_at timestamptz not null default now(),created_at timestamptz not null default now(),
 unique(facility_id,rule_version,component_type,donor_group,recipient_group));
create table if not exists public.blood_crossmatch_requests(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict,encounter_id uuid not null references public.encounters(id) on delete restrict,
 component_type text not null,recipient_group text not null,requested_by uuid not null references public.profiles(id) on delete restrict,
 requested_at timestamptz not null default now(),created_at timestamptz not null default now());
create table if not exists public.blood_crossmatch_results(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 request_id uuid not null references public.blood_crossmatch_requests(id) on delete restrict,
 unit_id uuid not null references public.blood_units(id) on delete restrict,compatible boolean not null,result text not null,
 rule_version integer not null,performed_by uuid not null references public.profiles(id) on delete restrict,
 performed_at timestamptz not null default now(),created_at timestamptz not null default now());
create table if not exists public.blood_unit_events(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 unit_id uuid not null references public.blood_units(id) on delete restrict,
 event_type text not null check(event_type in ('received','available','quarantined','issued','returned','verified','transfusion_started','transfused','discarded','recalled')),
 event_at timestamptz not null default now(),actor_id uuid not null references public.profiles(id) on delete restrict,
 request_id uuid references public.blood_crossmatch_requests(id) on delete restrict,
 patient_id uuid references public.patients(id) on delete restrict,
 cold_chain_accepted boolean,reason text,created_at timestamptz not null default now());
create table if not exists public.transfusion_records(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 request_id uuid not null references public.blood_crossmatch_requests(id) on delete restrict,
 unit_id uuid not null references public.blood_units(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict,encounter_id uuid not null references public.encounters(id) on delete restrict,
 verified_by uuid not null references public.profiles(id) on delete restrict,second_verified_by uuid not null references public.profiles(id) on delete restrict,
 started_at timestamptz not null default now(),created_at timestamptz not null default now(),check(verified_by<>second_verified_by),unique(request_id,unit_id));
create table if not exists public.transfusion_observations(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 transfusion_id uuid not null references public.transfusion_records(id) on delete restrict,
 phase text not null check(phase in ('before','during','after')),observed_at timestamptz not null default now(),
 vitals jsonb not null check(jsonb_typeof(vitals)='object'),notes text,recorded_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now());
create table if not exists public.transfusion_reactions(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 transfusion_id uuid not null references public.transfusion_records(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict,unit_id uuid not null references public.blood_units(id) on delete restrict,
 reported_by uuid not null references public.profiles(id) on delete restrict,reported_at timestamptz not null default now(),
 description text not null check(length(btrim(description))>0),actions jsonb not null default '{}'::jsonb check(jsonb_typeof(actions)='object'),created_at timestamptz not null default now());

create index if not exists blood_units_expiry_idx on public.blood_units(facility_id,expires_at);
create index if not exists blood_unit_events_trace_idx on public.blood_unit_events(unit_id,event_at,id);
create index if not exists blood_crossmatch_patient_idx on public.blood_crossmatch_requests(patient_id,requested_at desc);
create index if not exists transfusion_patient_idx on public.transfusion_records(patient_id,started_at desc);

alter table public.blood_bank_clinical_owners enable row level security;
revoke all on public.blood_bank_clinical_owners from public,anon,authenticated;
grant select on public.blood_bank_clinical_owners to authenticated;
grant select,insert,update on public.blood_bank_clinical_owners to service_role;
drop policy if exists blood_owner_read on public.blood_bank_clinical_owners;
create policy blood_owner_read on public.blood_bank_clinical_owners for select to authenticated using(public.has_org_permission('bloodbank.manage',facility_id,null) or public.has_org_permission('bloodbank.rules.review',facility_id,null));
drop trigger if exists audit_blood_bank_clinical_owners on public.blood_bank_clinical_owners;
create trigger audit_blood_bank_clinical_owners after insert or update on public.blood_bank_clinical_owners for each row execute function public.audit_row_change();
alter table public.blood_bank_witness_credentials enable row level security;
revoke all on public.blood_bank_witness_credentials from public,anon,authenticated;
grant select,insert,update on public.blood_bank_witness_credentials to service_role;

do $$ declare t text; begin foreach t in array array['blood_donors','blood_units','blood_compatibility_rules','blood_crossmatch_requests','blood_crossmatch_results','blood_unit_events','transfusion_records','transfusion_observations','transfusion_reactions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant select,insert on public.%I to service_role',t);
 execute format('drop policy if exists blood_read on public.%I',t);
 if t='transfusion_observations' then
  execute format('create policy blood_read on public.%I for select to authenticated using (exists(select 1 from public.transfusion_records tr where tr.id=transfusion_id and public.has_clinical_department_permission(tr.patient_id,''Ward / Nursing'',''bloodbank.transfuse'',false)))',t);
 else
  execute format('create policy blood_read on public.%I for select to authenticated using (public.has_org_permission(''bloodbank.manage'',facility_id,null) or public.has_org_permission(''bloodbank.crossmatch'',facility_id,null) or public.has_org_permission(''bloodbank.transfuse'',facility_id,null))',t);
 end if;
 execute format('drop trigger if exists %I on public.%I',t||'_immutable',t);
 execute format('create trigger %I before update or delete on public.%I for each row execute function public.prevent_consultation_history_mutation()',t||'_immutable',t);
 execute format('drop trigger if exists audit_%I on public.%I',t,t);
 execute format('create trigger audit_%I after insert on public.%I for each row execute function public.audit_row_change()',t,t);
end loop; end $$;
revoke all on public.blood_donors,public.blood_units,public.blood_compatibility_rules,public.blood_crossmatch_requests,public.blood_crossmatch_results,public.blood_unit_events,public.transfusion_records,public.transfusion_observations,public.transfusion_reactions from authenticated;
grant select on public.blood_donors,public.blood_units,public.blood_compatibility_rules,public.blood_crossmatch_requests,public.blood_crossmatch_results,public.blood_unit_events,public.transfusion_records,public.transfusion_reactions to authenticated;
grant select on public.transfusion_observations to authenticated;

create or replace view public.blood_unit_inventory with (security_invoker=true) as
select u.*,coalesce((select e.event_type from public.blood_unit_events e where e.unit_id=u.id order by e.event_at desc,e.id desc limit 1),'received') as status
from public.blood_units u;
grant select on public.blood_unit_inventory to authenticated,service_role;

create or replace function public.register_blood_unit(p_facility_id uuid,p_donor_number text,p_unit_number text,p_component_type text,p_blood_group text,p_expires_at timestamptz) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; donor uuid; unit uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_org_permission('bloodbank.manage',p_facility_id,null) then raise exception 'Blood bank facility permission denied.'; end if;
 if nullif(btrim(p_donor_number),'') is null or nullif(btrim(p_unit_number),'') is null or nullif(btrim(p_component_type),'') is null or nullif(btrim(p_blood_group),'') is null or p_expires_at is null then raise exception 'Complete donor and unit details are required.'; end if;
 select id into donor from public.blood_donors where facility_id=p_facility_id and donor_number=btrim(p_donor_number);
 if donor is null then insert into public.blood_donors(facility_id,donor_number,created_by) values(p_facility_id,btrim(p_donor_number),actor) returning id into donor; end if;
 insert into public.blood_units(facility_id,donor_id,unit_number,component_type,blood_group,expires_at,created_by) values(p_facility_id,donor,btrim(p_unit_number),btrim(p_component_type),btrim(p_blood_group),p_expires_at,actor) returning id into unit;
 insert into public.blood_unit_events(facility_id,unit_id,event_type,actor_id) values(p_facility_id,unit,'received',actor);
 return unit;
end $$;

create or replace function public.review_blood_compatibility_rule(p_facility_id uuid,p_rule_version integer,p_component_type text,p_donor_group text,p_recipient_group text,p_compatible boolean) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; rule_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not exists(select 1 from public.blood_bank_clinical_owners o join public.profiles p on p.id=o.profile_id and p.status::text='active' and p.role::text in ('doctor','nurse') and p.facility_id=o.facility_id where o.facility_id=p_facility_id and o.profile_id=actor) then raise exception 'Only the assigned clinical owner may review compatibility rules.'; end if;
 if p_rule_version<1 or nullif(btrim(p_component_type),'') is null or nullif(btrim(p_donor_group),'') is null or nullif(btrim(p_recipient_group),'') is null then raise exception 'A complete compatibility rule is required.'; end if;
 insert into public.blood_compatibility_rules(facility_id,rule_version,component_type,donor_group,recipient_group,compatible,clinical_owner_id)
 values(p_facility_id,p_rule_version,btrim(p_component_type),btrim(p_donor_group),btrim(p_recipient_group),p_compatible,actor) returning id into rule_id;
 return rule_id;
end $$;

create or replace function public.assign_blood_bank_clinical_owner(p_facility_id uuid,p_profile_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text='super_admin';
 if actor is null then raise exception 'Only a super administrator may assign the facility clinical owner.'; end if;
 if not exists(select 1 from public.profiles where id=p_profile_id and facility_id=p_facility_id and status::text='active' and role::text in ('doctor','nurse')) then raise exception 'Clinical owner must be an active doctor or nurse assigned to this facility.'; end if;
 insert into public.blood_bank_clinical_owners(facility_id,profile_id,assigned_by) values(p_facility_id,p_profile_id,actor)
 on conflict(facility_id) do update set profile_id=excluded.profile_id,assigned_by=excluded.assigned_by,assigned_at=now();
end $$;

create or replace function public.set_blood_bank_witness_pin(p_pin text) returns void
language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('nurse','doctor');
 if actor is null or p_pin !~ '^[0-9]{6,12}$' then raise exception 'An active nurse or doctor and a 6 to 12 digit co-sign PIN are required.'; end if;
 insert into public.blood_bank_witness_credentials(profile_id,pin_hash) values(actor,crypt(p_pin,gen_salt('bf')))
 on conflict(profile_id) do update set pin_hash=excluded.pin_hash,updated_at=now();
end $$;

create or replace function public.set_blood_unit_status(p_unit_id uuid,p_event_type text,p_reason text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare u public.blood_units%rowtype; actor uuid; event_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into u from public.blood_units where id=p_unit_id;
 if not found or actor is null or not public.has_org_permission('bloodbank.manage',u.facility_id,null) then raise exception 'Blood bank unit access denied.'; end if;
 if p_event_type not in ('available','quarantined','discarded','recalled') then raise exception 'Unsupported unit status event.'; end if;
 if p_event_type in ('quarantined','discarded','recalled') and nullif(btrim(p_reason),'') is null then raise exception 'A reason is required for this unit status change.'; end if;
 if (select event_type from public.blood_unit_events where unit_id=u.id order by event_at desc,id desc limit 1) in ('verified','transfusion_started','transfused','discarded','recalled') and p_event_type='available' then raise exception 'This unit cannot be made available from its current status.'; end if;
 insert into public.blood_unit_events(facility_id,unit_id,event_type,actor_id,reason) values(u.facility_id,u.id,p_event_type,actor,nullif(btrim(p_reason),'')) returning id into event_id;
 return event_id;
end $$;

create or replace function public.request_blood_crossmatch(p_patient_id uuid,p_encounter_id uuid,p_component_type text,p_recipient_group text) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; fac uuid; enc_patient uuid; request_id uuid;
begin
 select id,facility_id into actor,fac from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select patient_id into enc_patient from public.encounters where id=p_encounter_id;
 select coalesce(home_facility_id,fac) into fac from public.patients where id=p_patient_id;
 if actor is null or enc_patient is distinct from p_patient_id or not public.has_any_role(array['doctor','nurse','super_admin']) or not public.has_clinical_department_permission(p_patient_id,'Laboratory','bloodbank.crossmatch',false) then raise exception 'Crossmatch request access or patient context invalid.'; end if;
 insert into public.blood_crossmatch_requests(facility_id,patient_id,encounter_id,component_type,recipient_group,requested_by) values(fac,p_patient_id,p_encounter_id,btrim(p_component_type),btrim(p_recipient_group),actor) returning id into request_id;
 return request_id;
end $$;

create or replace function public.record_blood_crossmatch(p_request_id uuid,p_unit_id uuid,p_result text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.blood_crossmatch_requests%rowtype; u public.blood_units%rowtype; actor uuid; rule_row public.blood_compatibility_rules%rowtype; result_id uuid; current_status text;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('laboratory_scientist','super_admin');
 select * into r from public.blood_crossmatch_requests where id=p_request_id;
 select * into u from public.blood_units where id=p_unit_id;
 if actor is null or not found or r.id is null or u.id is null or r.facility_id<>u.facility_id or u.component_type<>r.component_type or not public.has_clinical_department_permission(r.patient_id,'Laboratory','bloodbank.crossmatch',false) then raise exception 'Laboratory crossmatch access denied or component does not match request.'; end if;
 select event_type into current_status from public.blood_unit_events where unit_id=u.id order by event_at desc,id desc limit 1;
 if current_status<>'available' or u.expires_at<=now() then raise exception 'Unit is not available or has expired.'; end if;
 select * into rule_row from public.blood_compatibility_rules where facility_id=u.facility_id and rule_version=(select max(rule_version) from public.blood_compatibility_rules where facility_id=u.facility_id) and component_type=r.component_type and donor_group=u.blood_group and recipient_group=r.recipient_group;
 if not found then raise exception 'No clinically reviewed compatibility rule is configured for this pair.'; end if;
 if p_result not in ('compatible','incompatible') then raise exception 'Crossmatch result must be compatible or incompatible.'; end if;
 insert into public.blood_crossmatch_results(facility_id,request_id,unit_id,compatible,result,rule_version,performed_by) values(r.facility_id,r.id,u.id,rule_row.compatible and p_result='compatible',p_result,rule_row.rule_version,actor) returning id into result_id;
 return result_id;
end $$;

create or replace function public.issue_blood_unit(p_request_id uuid,p_unit_id uuid,p_cold_chain_accepted boolean) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.blood_crossmatch_requests%rowtype; u public.blood_units%rowtype; actor uuid; status text; event_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('laboratory_scientist','super_admin');
 select * into r from public.blood_crossmatch_requests where id=p_request_id; select * into u from public.blood_units where id=p_unit_id for update;
 if actor is null or r.id is null or u.id is null or r.facility_id<>u.facility_id or not public.has_org_permission('bloodbank.manage',u.facility_id,null) then raise exception 'Blood bank issue access denied.'; end if;
 select event_type into status from public.blood_unit_events where unit_id=u.id order by event_at desc,id desc limit 1;
 if status<>'available' or u.expires_at<=now() then raise exception 'Unit is not available or has expired.'; end if;
 if p_cold_chain_accepted is distinct from true then raise exception 'Cold-chain acceptance is required to issue a unit.'; end if;
 if not exists(select 1 from (select x.compatible,x.result,x.rule_version from public.blood_crossmatch_results x where x.request_id=r.id and x.unit_id=u.id order by x.performed_at desc,x.id desc limit 1) latest where latest.compatible and latest.result='compatible' and latest.rule_version=(select max(cr.rule_version) from public.blood_compatibility_rules cr where cr.facility_id=r.facility_id)) then raise exception 'A latest compatible crossmatch result under the current reviewed rule version is required before issue.'; end if;
 insert into public.blood_unit_events(facility_id,unit_id,event_type,actor_id,request_id,patient_id,cold_chain_accepted) values(u.facility_id,u.id,'issued',actor,r.id,r.patient_id,true) returning id into event_id;
 return event_id;
end $$;

create or replace function public.return_blood_unit(p_unit_id uuid,p_cold_chain_accepted boolean,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare u public.blood_units%rowtype; actor uuid; event_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; select * into u from public.blood_units where id=p_unit_id;
 if actor is null or not public.has_org_permission('bloodbank.manage',u.facility_id,null) then raise exception 'Blood bank return access denied.'; end if;
 if (select event_type from public.blood_unit_events where unit_id=u.id order by event_at desc,id desc limit 1)<>'issued' then raise exception 'Only an issued unit can be returned.'; end if;
 if p_cold_chain_accepted is null or nullif(btrim(p_reason),'') is null then raise exception 'Cold-chain acceptance and return reason are required.'; end if;
 insert into public.blood_unit_events(facility_id,unit_id,event_type,actor_id,cold_chain_accepted,reason) values(u.facility_id,u.id,'returned',actor,p_cold_chain_accepted,btrim(p_reason)) returning id into event_id;
 return event_id;
end $$;

create or replace function public.start_transfusion(p_request_id uuid,p_unit_id uuid,p_patient_id uuid,p_encounter_id uuid,p_second_verifier uuid,p_second_pin text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.blood_crossmatch_requests%rowtype; u public.blood_units%rowtype; actor uuid; second_profile public.profiles%rowtype; id_out uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('nurse','doctor','super_admin');
 select * into r from public.blood_crossmatch_requests where id=p_request_id; select * into u from public.blood_units where id=p_unit_id;
 select * into second_profile from public.profiles where id=p_second_verifier and status::text='active' and role::text in ('nurse','doctor');
 if actor is null or actor=p_second_verifier or second_profile.id is null or second_profile.facility_id is distinct from r.facility_id then raise exception 'Two distinct authorized staff verifiers from this facility are required.'; end if;
 if p_second_pin is null or not exists(select 1 from public.blood_bank_witness_credentials c where c.profile_id=second_profile.id and c.pin_hash=crypt(p_second_pin,c.pin_hash)) then raise exception 'Second verifier co-sign PIN is invalid or not configured.'; end if;
 if r.patient_id<>p_patient_id or r.encounter_id<>p_encounter_id or u.facility_id<>r.facility_id or not public.has_clinical_department_permission(p_patient_id,'Ward / Nursing','bloodbank.transfuse',false) then raise exception 'Bedside patient, encounter, or facility verification failed.'; end if;
 if (select event_type from public.blood_unit_events where unit_id=u.id order by event_at desc,id desc limit 1)<>'issued' or not exists(select 1 from public.blood_unit_events where unit_id=u.id and request_id=r.id and patient_id=p_patient_id and event_type='issued') then raise exception 'Unit has not been issued to this patient and request.'; end if;
 insert into public.transfusion_records(facility_id,request_id,unit_id,patient_id,encounter_id,verified_by,second_verified_by) values(r.facility_id,r.id,u.id,p_patient_id,p_encounter_id,actor,p_second_verifier) returning id into id_out;
 insert into public.blood_unit_events(facility_id,unit_id,event_type,actor_id,request_id,patient_id,reason) values(u.facility_id,u.id,'verified',actor,r.id,p_patient_id,'Bedside two-person verification completed');
 return id_out;
end $$;

create or replace function public.begin_transfusion(p_transfusion_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare tr public.transfusion_records%rowtype; actor uuid; event_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('nurse','doctor','super_admin');
 select * into tr from public.transfusion_records where id=p_transfusion_id;
 if actor is null or tr.id is null or not public.has_clinical_department_permission(tr.patient_id,'Ward / Nursing','bloodbank.transfuse',false) then raise exception 'Transfusion start access denied.'; end if;
 if (select event_type from public.blood_unit_events where unit_id=tr.unit_id order by event_at desc,id desc limit 1)<>'verified' then raise exception 'Two-person verification must be completed before transfusion starts.'; end if;
 if not exists(select 1 from public.transfusion_observations where transfusion_id=tr.id and phase='before') then raise exception 'A before-transfusion observation is required before starting.'; end if;
 insert into public.blood_unit_events(facility_id,unit_id,event_type,actor_id,request_id,patient_id,reason) values(tr.facility_id,tr.unit_id,'transfusion_started',actor,tr.request_id,tr.patient_id,'Transfusion started') returning id into event_id;
 return event_id;
end $$;

create or replace function public.complete_transfusion(p_transfusion_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare tr public.transfusion_records%rowtype; actor uuid; event_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('nurse','doctor','super_admin');
 select * into tr from public.transfusion_records where id=p_transfusion_id;
 if actor is null or tr.id is null or not public.has_clinical_department_permission(tr.patient_id,'Ward / Nursing','bloodbank.transfuse',false) then raise exception 'Transfusion completion access denied.'; end if;
 if (select event_type from public.blood_unit_events where unit_id=tr.unit_id order by event_at desc,id desc limit 1)<>'transfusion_started' then raise exception 'Transfusion is not in progress.'; end if;
 if not exists(select 1 from public.transfusion_observations where transfusion_id=tr.id and phase='before') or not exists(select 1 from public.transfusion_observations where transfusion_id=tr.id and phase='during') or not exists(select 1 from public.transfusion_observations where transfusion_id=tr.id and phase='after') then raise exception 'Before, during, and after observations are required before completion.'; end if;
 insert into public.blood_unit_events(facility_id,unit_id,event_type,actor_id,request_id,patient_id,reason) values(tr.facility_id,tr.unit_id,'transfused',actor,tr.request_id,tr.patient_id,'Transfusion completed') returning id into event_id;
 return event_id;
end $$;

create or replace function public.record_transfusion_observation(p_transfusion_id uuid,p_phase text,p_vitals jsonb,p_notes text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare tr public.transfusion_records%rowtype; actor uuid; observation_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('nurse','doctor','super_admin'); select * into tr from public.transfusion_records where id=p_transfusion_id;
 if actor is null or tr.id is null or not public.has_clinical_department_permission(tr.patient_id,'Ward / Nursing','bloodbank.transfuse',false) then raise exception 'Transfusion observation access denied.'; end if;
 if p_phase not in ('before','during','after') or jsonb_typeof(p_vitals)<>'object' then raise exception 'A valid observation phase and structured vital signs are required.'; end if;
 if p_phase='before' and (select event_type from public.blood_unit_events where unit_id=tr.unit_id order by event_at desc,id desc limit 1)<>'verified' then raise exception 'Before-transfusion observations must be recorded after verification and before transfusion starts.'; end if;
 if p_phase in ('during','after') and (select event_type from public.blood_unit_events where unit_id=tr.unit_id order by event_at desc,id desc limit 1)<>'transfusion_started' then raise exception 'During/after observations require an in-progress transfusion.'; end if;
 insert into public.transfusion_observations(facility_id,transfusion_id,phase,vitals,notes,recorded_by) values(tr.facility_id,tr.id,p_phase,p_vitals,nullif(btrim(p_notes),''),actor) returning id into observation_id; return observation_id;
end $$;

create or replace function public.report_transfusion_reaction(p_transfusion_id uuid,p_description text,p_actions jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare tr public.transfusion_records%rowtype; actor uuid; reaction_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text in ('nurse','doctor','super_admin'); select * into tr from public.transfusion_records where id=p_transfusion_id;
 if actor is null or tr.id is null or not public.has_clinical_department_permission(tr.patient_id,'Ward / Nursing','bloodbank.transfuse',false) then raise exception 'Reaction reporting access denied.'; end if;
 if nullif(btrim(p_description),'') is null or jsonb_typeof(p_actions)<>'object' then raise exception 'Reaction description and structured actions are required.'; end if;
 insert into public.transfusion_reactions(facility_id,transfusion_id,patient_id,unit_id,reported_by,description,actions) values(tr.facility_id,tr.id,tr.patient_id,tr.unit_id,actor,btrim(p_description),p_actions) returning id into reaction_id; return reaction_id;
end $$;

create or replace function public.find_blood_unit_recall(p_unit_number text)
returns table(unit_id uuid,facility_id uuid,unit_number text,patient_id uuid,request_id uuid,transfusion_id uuid,event_type text,event_at timestamptz)
language sql stable security definer set search_path=public as $$
 select u.id,u.facility_id,u.unit_number,e.patient_id,e.request_id,tr.id,e.event_type,e.event_at
 from public.blood_units u join public.blood_unit_events e on e.unit_id=u.id
 left join public.transfusion_records tr on tr.unit_id=u.id
 where u.unit_number=btrim(p_unit_number) and public.has_org_permission('bloodbank.manage',u.facility_id,null)
 order by e.event_at,e.id
$$;

revoke all on function public.register_blood_unit(uuid,text,text,text,text,timestamptz),public.review_blood_compatibility_rule(uuid,integer,text,text,text,boolean),public.assign_blood_bank_clinical_owner(uuid,uuid),public.set_blood_bank_witness_pin(text),public.set_blood_unit_status(uuid,text,text),public.request_blood_crossmatch(uuid,uuid,text,text),public.record_blood_crossmatch(uuid,uuid,text),public.issue_blood_unit(uuid,uuid,boolean),public.return_blood_unit(uuid,boolean,text),public.start_transfusion(uuid,uuid,uuid,uuid,uuid,text),public.begin_transfusion(uuid),public.complete_transfusion(uuid),public.record_transfusion_observation(uuid,text,jsonb,text),public.report_transfusion_reaction(uuid,text,jsonb),public.find_blood_unit_recall(text) from public,anon;
grant execute on function public.register_blood_unit(uuid,text,text,text,text,timestamptz),public.review_blood_compatibility_rule(uuid,integer,text,text,text,boolean),public.assign_blood_bank_clinical_owner(uuid,uuid),public.set_blood_bank_witness_pin(text),public.set_blood_unit_status(uuid,text,text),public.request_blood_crossmatch(uuid,uuid,text,text),public.record_blood_crossmatch(uuid,uuid,text),public.issue_blood_unit(uuid,uuid,boolean),public.return_blood_unit(uuid,boolean,text),public.start_transfusion(uuid,uuid,uuid,uuid,uuid,text),public.begin_transfusion(uuid),public.complete_transfusion(uuid),public.record_transfusion_observation(uuid,text,jsonb,text),public.report_transfusion_reaction(uuid,text,jsonb),public.find_blood_unit_recall(text) to authenticated;

do $$ declare t text; begin foreach t in array array['blood_donors','blood_units','blood_compatibility_rules','blood_crossmatch_requests','blood_crossmatch_results','blood_unit_events','transfusion_records','transfusion_observations','transfusion_reactions'] loop
 execute format('drop trigger if exists audit_%I on public.%I',t,t);
 execute format('create trigger audit_%I after insert on public.%I for each row execute function public.audit_row_change()',t,t);
end loop; end $$;
notify pgrst,'reload schema';
commit;
