begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

insert into public.permission_catalog(permission_key,description,sensitive) values
 ('surgery.checklist.configure','Configure facility surgical checklist templates',true),
 ('surgery.checklist.complete','Complete surgical safety checklist instances',true),
 ('surgery.anaesthesia.record','Record anaesthesia, recovery, and consumable records',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=excluded.sensitive;
insert into public.role_permission_grants(role,permission_key,scope) values
 ('super_admin','surgery.checklist.configure','facility'),
 ('doctor','surgery.checklist.complete','department'),('nurse','surgery.checklist.complete','department'),
 ('surgeon','surgery.checklist.complete','department'),('theatre_staff','surgery.checklist.complete','department'),
 ('doctor','surgery.anaesthesia.record','department'),('nurse','surgery.anaesthesia.record','department'),
 ('surgeon','surgery.anaesthesia.record','department'),('theatre_staff','surgery.anaesthesia.record','department')
on conflict do nothing;

create table public.surgical_checklist_templates(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 phase text not null check(phase in ('pre_induction','time_out','sign_out')),
 template_version integer not null default 1 check(template_version>0),items jsonb not null default '[]'::jsonb check(jsonb_typeof(items)='array'),
 updated_by uuid not null references public.profiles(id) on delete restrict,updated_at timestamptz not null default now(),
 unique(facility_id,phase));
create table public.surgical_checklist_instances(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 surgery_id uuid not null references public.surgeries(id) on delete restrict,
 phase text not null check(phase in ('pre_induction','time_out','sign_out')),
 template_version integer not null,template_items jsonb not null check(jsonb_typeof(template_items)='array'),
 created_by uuid not null references public.profiles(id) on delete restrict,created_at timestamptz not null default now(),
 unique(surgery_id,phase,template_version));
create table public.surgical_checklist_answers(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 surgery_id uuid not null references public.surgeries(id) on delete restrict,
 instance_id uuid not null references public.surgical_checklist_instances(id) on delete restrict,
 item_key text not null,confirmed boolean not null,note text,
 recorded_by uuid not null references public.profiles(id) on delete restrict,recorded_at timestamptz not null default now(),created_at timestamptz not null default now());
create index surgical_checklist_answers_latest_idx on public.surgical_checklist_answers(instance_id,item_key,recorded_at desc,id desc);
create table public.surgical_checklist_completions(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 surgery_id uuid not null references public.surgeries(id) on delete restrict,
 instance_id uuid not null unique references public.surgical_checklist_instances(id) on delete restrict,
 completed_by uuid not null references public.profiles(id) on delete restrict,completed_at timestamptz not null default now());
create table public.surgery_anaesthesia_events(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 surgery_id uuid not null references public.surgeries(id) on delete restrict,
 event_type text not null check(event_type in ('pre_assessment','agent_dose','intraoperative_observation','recovery_handover')),
 free_text text,agent_name text,dose numeric(12,4),dose_unit text,route text,administered_at timestamptz,
 details jsonb not null check(jsonb_typeof(details)='object'),recorded_by uuid not null references public.profiles(id) on delete restrict,
 recorded_at timestamptz not null default now(),created_at timestamptz not null default now());
create table public.surgery_recovery_observations(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 surgery_id uuid not null references public.surgeries(id) on delete restrict,
 observations jsonb not null check(jsonb_typeof(observations)='object'),recorded_by uuid not null references public.profiles(id) on delete restrict,
 observed_at timestamptz not null default now(),created_at timestamptz not null default now());
create table public.surgery_consumable_reconciliations(
 id uuid primary key default gen_random_uuid(),facility_id uuid not null references public.facilities(id) on delete restrict,
 surgery_id uuid not null references public.surgeries(id) on delete restrict,
 item text not null check(length(btrim(item))>0),expected_count integer not null check(expected_count>=0),counted_count integer not null check(counted_count>=0),
 discrepancy_reason text,recorded_by uuid not null references public.profiles(id) on delete restrict,
 recorded_at timestamptz not null default now(),created_at timestamptz not null default now(),
 check(expected_count=counted_count or nullif(btrim(discrepancy_reason),'') is not null));

create index surgical_checklist_instance_surgery_idx on public.surgical_checklist_instances(surgery_id,phase,created_at desc);
create index surgery_anaesthesia_surgery_idx on public.surgery_anaesthesia_events(surgery_id,recorded_at,id);
create index surgery_recovery_surgery_idx on public.surgery_recovery_observations(surgery_id,observed_at,id);
create index surgery_consumables_surgery_idx on public.surgery_consumable_reconciliations(surgery_id,recorded_at,id);

create or replace function public.can_access_surgery(p_surgery_id uuid,p_permission text default 'surgery.manage') returns boolean
language plpgsql stable security definer set search_path=public as $$
declare p_id uuid;
begin
 select patient_id into p_id from public.surgeries where id=p_surgery_id;
 return p_id is not null and public.has_clinical_department_permission(p_id,'Surgery',p_permission,false);
end $$;
revoke all on function public.can_access_surgery(uuid,text) from public,anon;
grant execute on function public.can_access_surgery(uuid,text) to authenticated;

do $$ declare t text; begin foreach t in array array['surgical_checklist_instances','surgical_checklist_answers','surgical_checklist_completions','surgery_anaesthesia_events','surgery_recovery_observations','surgery_consumable_reconciliations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant select,insert on public.%I to service_role',t);
 execute format('create policy surgery_records_read on public.%I for select to authenticated using(public.has_org_permission(''surgery.manage'',facility_id,null) and public.can_access_surgery(surgery_id,''surgery.manage''))',t);
 execute format('create trigger %I before update or delete on public.%I for each row execute function public.prevent_consultation_history_mutation()',t||'_immutable',t);
 execute format('create trigger audit_%I after insert on public.%I for each row execute function public.audit_row_change()',t,t);
end loop; end $$;
alter table public.surgical_checklist_templates enable row level security;
revoke all on public.surgical_checklist_templates from public,anon,authenticated;
grant select on public.surgical_checklist_templates to authenticated;
grant select,insert,update on public.surgical_checklist_templates to service_role;
create policy surgical_checklist_templates_read on public.surgical_checklist_templates for select to authenticated
 using(public.has_org_permission('surgery.manage',facility_id,null));
create trigger audit_surgical_checklist_templates after insert or update on public.surgical_checklist_templates for each row execute function public.audit_row_change();

create or replace function public.set_surgical_checklist_template(p_facility_id uuid,p_phase text,p_items jsonb) returns integer
language plpgsql security definer set search_path=public as $$
declare actor uuid; next_version integer;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' and role::text='super_admin';
 if actor is null or not public.has_org_permission('surgery.checklist.configure',p_facility_id,null) then raise exception 'Facility checklist configuration access denied.'; end if;
 if p_phase not in ('pre_induction','time_out','sign_out') or p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'A supported checklist phase and JSON item array are required.'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) as elements(item) where jsonb_typeof(item)<>'object' or nullif(btrim(item->>'key'),'') is null or nullif(btrim(item->>'label'),'') is null or (item ? 'required' and jsonb_typeof(item->'required')<>'boolean')) then raise exception 'Each checklist item requires a key, label, and optional boolean required flag.'; end if;
 if (select count(*) from jsonb_array_elements(p_items) as elements(item))<>(select count(distinct item->>'key') from jsonb_array_elements(p_items) as elements(item)) then raise exception 'Checklist item keys must be unique.'; end if;
 select coalesce(max(template_version),0)+1 into next_version from public.surgical_checklist_templates where facility_id=p_facility_id and phase=p_phase;
 insert into public.surgical_checklist_templates(facility_id,phase,template_version,items,updated_by)
 values(p_facility_id,p_phase,next_version,p_items,actor)
 on conflict(facility_id,phase) do update set template_version=excluded.template_version,items=excluded.items,updated_by=excluded.updated_by,updated_at=now();
 return next_version;
end $$;

create or replace function public.create_surgical_checklist_instance(p_surgery_id uuid,p_phase text) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; patient_facility uuid; template_row public.surgical_checklist_templates%rowtype; instance_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or p_phase not in ('pre_induction','time_out','sign_out') or not public.can_access_surgery(p_surgery_id,'surgery.checklist.complete') then raise exception 'Surgical checklist access denied.'; end if;
 select coalesce(p.home_facility_id,pr.facility_id) into patient_facility from public.surgeries s join public.patients p on p.id=s.patient_id join public.profiles pr on pr.id=actor where s.id=p_surgery_id;
 select * into template_row from public.surgical_checklist_templates where facility_id=patient_facility and phase=p_phase;
 if not found or jsonb_array_length(template_row.items)=0 then raise exception 'Facility has not configured a non-empty template for this checklist phase.'; end if;
 insert into public.surgical_checklist_instances(facility_id,surgery_id,phase,template_version,template_items,created_by)
 values(patient_facility,p_surgery_id,p_phase,template_row.template_version,template_row.items,actor)
 on conflict(surgery_id,phase,template_version) do nothing returning id into instance_id;
 if instance_id is null then select id into instance_id from public.surgical_checklist_instances where surgery_id=p_surgery_id and phase=p_phase and template_version=template_row.template_version; end if;
 return instance_id;
end $$;

create or replace function public.answer_surgical_checklist_item(p_instance_id uuid,p_item_key text,p_confirmed boolean,p_note text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; i public.surgical_checklist_instances%rowtype; answer_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into i from public.surgical_checklist_instances where id=p_instance_id for update;
 if actor is null or i.id is null or not public.can_access_surgery(i.surgery_id,'surgery.checklist.complete') then raise exception 'Surgical checklist access denied.'; end if;
 if exists(select 1 from public.surgical_checklist_completions where instance_id=i.id) then raise exception 'Completed checklist instances are immutable.'; end if;
 if not exists(select 1 from jsonb_array_elements(i.template_items) as elements(item) where item->>'key'=p_item_key) then raise exception 'Checklist item is not part of this template snapshot.'; end if;
 insert into public.surgical_checklist_answers(facility_id,surgery_id,instance_id,item_key,confirmed,note,recorded_by)
 values(i.facility_id,i.surgery_id,i.id,p_item_key,p_confirmed,nullif(btrim(p_note),''),actor) returning id into answer_id;
 return answer_id;
end $$;

create or replace function public.complete_surgical_checklist(p_instance_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; i public.surgical_checklist_instances%rowtype; completion_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into i from public.surgical_checklist_instances where id=p_instance_id for update;
 if actor is null or i.id is null or not public.can_access_surgery(i.surgery_id,'surgery.checklist.complete') then raise exception 'Surgical checklist access denied.'; end if;
 if exists(select 1 from public.surgical_checklist_completions where instance_id=i.id) then raise exception 'Checklist instance is already complete.'; end if;
 if exists(select 1 from jsonb_array_elements(i.template_items) as elements(item) where coalesce((item->>'required')::boolean,true) and not exists(
   select 1 from public.surgical_checklist_answers a where a.instance_id=i.id and a.item_key=item->>'key' and a.confirmed
     and a.id=(select latest.id from public.surgical_checklist_answers latest where latest.instance_id=i.id and latest.item_key=item->>'key' order by latest.recorded_at desc,latest.id desc limit 1))) then
   raise exception 'Every required checklist item must have a current confirmed answer.';
 end if;
 insert into public.surgical_checklist_completions(facility_id,surgery_id,instance_id,completed_by) values(i.facility_id,i.surgery_id,i.id,actor) returning id into completion_id;
 return completion_id;
end $$;

create or replace function public.add_surgery_anaesthesia_event(p_surgery_id uuid,p_event_type text,p_details jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; facility uuid; record_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.can_access_surgery(p_surgery_id,'surgery.anaesthesia.record') then raise exception 'Anaesthesia record access denied.'; end if;
 if p_event_type not in ('pre_assessment','agent_dose','intraoperative_observation','recovery_handover') or jsonb_typeof(p_details)<>'object' then raise exception 'A supported anaesthesia record type and structured details are required.'; end if;
 select coalesce(p.home_facility_id,pr.facility_id) into facility from public.surgeries s join public.patients p on p.id=s.patient_id join public.profiles pr on pr.id=actor where s.id=p_surgery_id;
 insert into public.surgery_anaesthesia_events(facility_id,surgery_id,event_type,details,recorded_by) values(facility,p_surgery_id,p_event_type,p_details,actor) returning id into record_id;
 return record_id;
end $$;

create or replace function public.record_surgery_anaesthesia_agent(p_surgery_id uuid,p_free_text text,p_agent_name text,p_dose numeric,p_dose_unit text,p_route text,p_administered_at timestamptz default now()) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; facility uuid; record_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.can_access_surgery(p_surgery_id,'surgery.anaesthesia.record') then raise exception 'Anaesthesia agent record access denied.'; end if;
 if nullif(btrim(p_free_text),'') is null or nullif(btrim(p_agent_name),'') is null or p_dose is null or p_dose<0 or nullif(btrim(p_dose_unit),'') is null or nullif(btrim(p_route),'') is null or p_administered_at is null then
   raise exception 'Free-text note, agent, non-negative dose, dose unit, route, and administration time are required.';
 end if;
 select coalesce(p.home_facility_id,pr.facility_id) into facility from public.surgeries s join public.patients p on p.id=s.patient_id join public.profiles pr on pr.id=actor where s.id=p_surgery_id;
 insert into public.surgery_anaesthesia_events(facility_id,surgery_id,event_type,details,free_text,agent_name,dose,dose_unit,route,administered_at,recorded_by)
 values(facility,p_surgery_id,'agent_dose',jsonb_build_object('free_text',btrim(p_free_text),'agent_name',btrim(p_agent_name),'dose',p_dose,'dose_unit',btrim(p_dose_unit),'route',btrim(p_route),'administered_at',p_administered_at),btrim(p_free_text),btrim(p_agent_name),p_dose,btrim(p_dose_unit),btrim(p_route),p_administered_at,actor)
 returning id into record_id;
 return record_id;
end $$;

create or replace function public.add_surgery_recovery_observation(p_surgery_id uuid,p_observations jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; facility uuid; record_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.can_access_surgery(p_surgery_id,'surgery.anaesthesia.record') or jsonb_typeof(p_observations)<>'object' then raise exception 'Recovery observation access denied or invalid observations.'; end if;
 select coalesce(p.home_facility_id,pr.facility_id) into facility from public.surgeries s join public.patients p on p.id=s.patient_id join public.profiles pr on pr.id=actor where s.id=p_surgery_id;
 insert into public.surgery_recovery_observations(facility_id,surgery_id,observations,recorded_by) values(facility,p_surgery_id,p_observations,actor) returning id into record_id;
 return record_id;
end $$;

create or replace function public.reconcile_surgery_consumable(p_surgery_id uuid,p_item text,p_expected_count integer,p_counted_count integer,p_discrepancy_reason text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare actor uuid; facility uuid; record_id uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.can_access_surgery(p_surgery_id,'surgery.anaesthesia.record') then raise exception 'Surgical consumable reconciliation access denied.'; end if;
 select coalesce(p.home_facility_id,pr.facility_id) into facility from public.surgeries s join public.patients p on p.id=s.patient_id join public.profiles pr on pr.id=actor where s.id=p_surgery_id;
 insert into public.surgery_consumable_reconciliations(facility_id,surgery_id,item,expected_count,counted_count,discrepancy_reason,recorded_by)
 values(facility,p_surgery_id,btrim(p_item),p_expected_count,p_counted_count,nullif(btrim(p_discrepancy_reason),''),actor) returning id into record_id;
 return record_id;
end $$;

create or replace function public.has_completed_surgical_checklist(p_surgery_id uuid,p_facility_id uuid,p_phase text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.surgical_checklist_templates t join public.surgical_checklist_instances i on i.surgery_id=p_surgery_id and i.phase=t.phase and i.template_version=t.template_version
   join public.surgical_checklist_completions c on c.instance_id=i.id
   where t.facility_id=p_facility_id and t.phase=p_phase)
$$;
revoke all on function public.has_completed_surgical_checklist(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.guard_surgery_workflow() returns trigger
language plpgsql security definer set search_path=public as $$
declare patient_facility uuid;
begin
 if tg_op='INSERT' then
   if not public.has_any_role(array['super_admin','doctor','surgeon']) then raise exception 'Only an authorized clinician may request surgery.'; end if;
   if new.status <> 'requested' then raise exception 'Surgical requests must enter the review queue first.'; end if;
   new.requesting_clinician_id := coalesce(new.requesting_clinician_id,(select id from public.profiles where auth_user_id=auth.uid() limit 1));
   return new;
 end if;
 if new.status in ('deferred','rejected') and nullif(trim(new.review_reason),'') is null then raise exception 'A reason is required to defer or reject surgery.'; end if;
 if new.priority='elective' and new.status in ('scheduled','in-progress') and new.consent_status <> 'documented' then raise exception 'Document consent before scheduling or starting elective surgery.'; end if;
 if new.status='scheduled' and (new.scheduled_time is null or nullif(trim(new.ot_room),'') is null) then raise exception 'A scheduled procedure requires a time and theatre room.'; end if;
 if new.status is distinct from old.status and new.status in ('in-progress','completed') then
   select coalesce(p.home_facility_id,(select pr.facility_id from public.profiles pr where pr.id=new.surgeon_id),(select pr.facility_id from public.profiles pr where pr.id=new.requesting_clinician_id),(select pr.facility_id from public.profiles pr where pr.auth_user_id=auth.uid())) into patient_facility from public.patients p where p.id=new.patient_id;
   if new.status='in-progress' and (not public.has_completed_surgical_checklist(new.id,patient_facility,'pre_induction') or not public.has_completed_surgical_checklist(new.id,patient_facility,'time_out')) then
     raise exception 'Complete the current pre-induction and time-out checklists before starting surgery.';
   end if;
   if new.status='completed' and (not public.has_completed_surgical_checklist(new.id,patient_facility,'pre_induction') or not public.has_completed_surgical_checklist(new.id,patient_facility,'time_out') or not public.has_completed_surgical_checklist(new.id,patient_facility,'sign_out')) then
     raise exception 'Complete the current pre-induction, time-out, and sign-out checklists before completing surgery.';
   end if;
 end if;
 if new.status='in-progress' then new.started_at := coalesce(new.started_at,now()); end if;
 if new.status='completed' then
   if nullif(trim(new.operative_notes),'') is null or nullif(trim(new.postoperative_plan),'') is null then raise exception 'Operative notes and a postoperative plan are required before completing surgery.'; end if;
   new.ended_at := coalesce(new.ended_at,now());
 end if;
 return new;
end $$;

drop trigger if exists guard_surgery_workflow on public.surgeries;
create trigger guard_surgery_workflow before insert or update on public.surgeries for each row execute function public.guard_surgery_workflow();

revoke all on function public.set_surgical_checklist_template(uuid,text,jsonb),public.create_surgical_checklist_instance(uuid,text),public.answer_surgical_checklist_item(uuid,text,boolean,text),public.complete_surgical_checklist(uuid),public.add_surgery_anaesthesia_event(uuid,text,jsonb),public.record_surgery_anaesthesia_agent(uuid,text,text,numeric,text,text,timestamptz),public.add_surgery_recovery_observation(uuid,jsonb),public.reconcile_surgery_consumable(uuid,text,integer,integer,text) from public,anon;
grant execute on function public.set_surgical_checklist_template(uuid,text,jsonb),public.create_surgical_checklist_instance(uuid,text),public.answer_surgical_checklist_item(uuid,text,boolean,text),public.complete_surgical_checklist(uuid),public.add_surgery_anaesthesia_event(uuid,text,jsonb),public.record_surgery_anaesthesia_agent(uuid,text,text,numeric,text,text,timestamptz),public.add_surgery_recovery_observation(uuid,jsonb),public.reconcile_surgery_consumable(uuid,text,integer,integer,text) to authenticated;

notify pgrst,'reload schema';
commit;
