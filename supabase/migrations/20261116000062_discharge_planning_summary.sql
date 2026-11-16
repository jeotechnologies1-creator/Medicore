begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

create table public.discharge_checklist_templates (
 id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id) on delete restrict,
 version integer not null check(version>0), items jsonb not null default '[]'::jsonb check(jsonb_typeof(items)='array'),
 configured_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), unique(facility_id,version));
create unique index discharge_checklist_template_latest on public.discharge_checklist_templates(facility_id,version desc);
create table public.discharge_checklists (
 id uuid primary key default gen_random_uuid(), admission_id uuid not null unique references public.admissions(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict, facility_id uuid not null references public.facilities(id) on delete restrict,
 items jsonb not null check(jsonb_typeof(items)='array'), template_version integer, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now());
create table public.discharge_checklist_answers (
 id uuid primary key default gen_random_uuid(), checklist_id uuid not null references public.discharge_checklists(id) on delete restrict,
 item_key text not null, completed boolean not null, note text, recorded_by uuid not null references public.profiles(id), recorded_at timestamptz not null default now());
create index discharge_checklist_answers_latest on public.discharge_checklist_answers(checklist_id,item_key,recorded_at desc,id desc);
create table public.discharge_checklist_overrides (
 id uuid primary key default gen_random_uuid(), admission_id uuid not null references public.admissions(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict, facility_id uuid not null references public.facilities(id) on delete restrict,
 reason text not null check(length(btrim(reason))>0), authorized_by uuid not null references public.profiles(id), created_at timestamptz not null default now());
create table public.admission_discharge_summaries (
 id uuid primary key default gen_random_uuid(), admission_id uuid not null unique references public.admissions(id) on delete restrict,
 patient_id uuid not null references public.patients(id) on delete restrict, encounter_id uuid references public.encounters(id) on delete restrict,
 facility_id uuid not null references public.facilities(id) on delete restrict, summary jsonb not null check(jsonb_typeof(summary)='object'),
 authored_by uuid not null references public.profiles(id), auth_user_id uuid not null references auth.users(id),
 state text not null default 'draft' check(state in ('draft','signed')), created_at timestamptz not null default now(), signed_at timestamptz);
create table public.admission_discharge_signatures (
 id uuid primary key default gen_random_uuid(), summary_id uuid not null unique references public.admission_discharge_summaries(id) on delete restrict,
 admission_id uuid not null references public.admissions(id) on delete restrict, patient_id uuid not null references public.patients(id) on delete restrict,
 signed_by uuid not null references public.profiles(id), auth_user_id uuid not null references auth.users(id), signed_at timestamptz not null default now());

create or replace function public.discharge_context(p_admission uuid) returns table(patient_id uuid,facility_id uuid,encounter_id uuid)
language sql stable security definer set search_path=public as $$
 select a.patient_id,coalesce(p.home_facility_id,w.facility_id,pr.facility_id),a.encounter_id
 from public.admissions a join public.patients p on p.id=a.patient_id
 left join public.beds b on b.id=a.bed_id left join public.wards w on w.id=b.ward_id
 left join public.profiles pr on pr.id=a.doctor_id where a.id=p_admission
$$;

create or replace function public.configure_discharge_checklist(p_facility_id uuid,p_items jsonb) returns integer
language plpgsql security definer set search_path=public as $$
declare actor uuid; v integer;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if actor is null or not public.has_any_role(array['super_admin','doctor']) then raise exception 'Discharge checklist configuration access denied.'; end if;
 if not public.has_any_role(array['super_admin']) and not exists(select 1 from public.profiles where id=actor and facility_id=p_facility_id) then raise exception 'Facility access denied.'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or exists(select 1 from jsonb_array_elements(p_items) as e(item) where jsonb_typeof(e.item)<>'object' or nullif(btrim(e.item->>'key'),'') is null or nullif(btrim(e.item->>'label'),'') is null or (e.item->>'key') in ('medication_reconciliation_completed','follow_up_booked','patient_instructions_given')) then raise exception 'Checklist items require unique key and label; standard items are reserved.'; end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct e.item->>'key') from jsonb_array_elements(p_items) as e(item)) then raise exception 'Checklist item keys must be unique.'; end if;
 select coalesce(max(version),0)+1 into v from public.discharge_checklist_templates where facility_id=p_facility_id;
 insert into public.discharge_checklist_templates(facility_id,version,items,configured_by) values(p_facility_id,v,p_items,actor); return v;
end $$;

create or replace function public.ensure_discharge_checklist(p_admission_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare ctx record; actor uuid; template public.discharge_checklist_templates%rowtype; checklist uuid; itemset jsonb;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into ctx from public.discharge_context(p_admission_id);
 if ctx.patient_id is null or actor is null or not public.has_clinical_department_permission(ctx.patient_id,null,'admission.manage',false) then raise exception 'Discharge checklist access denied.'; end if;
 select id into checklist from public.discharge_checklists where admission_id=p_admission_id;
 if checklist is not null then return checklist; end if;
 select * into template from public.discharge_checklist_templates where facility_id=ctx.facility_id order by version desc limit 1;
 itemset:=coalesce(template.items,'[]'::jsonb)||jsonb_build_array(
  jsonb_build_object('key','medication_reconciliation_completed','label','Medication reconciliation completed','required',true),
  jsonb_build_object('key','follow_up_booked','label','Follow-up booked','required',true),
  jsonb_build_object('key','patient_instructions_given','label','Patient instructions given','required',true));
 insert into public.discharge_checklists(admission_id,patient_id,facility_id,items,template_version,created_by)
 values(p_admission_id,ctx.patient_id,ctx.facility_id,itemset,template.version,actor) returning id into checklist;
 return checklist;
end $$;

create or replace function public.record_discharge_checklist_answer(p_checklist_id uuid,p_item_key text,p_completed boolean,p_note text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare c public.discharge_checklists%rowtype; actor uuid; answer_id uuid;
begin
 select * into c from public.discharge_checklists where id=p_checklist_id;
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if c.id is null or actor is null or not public.has_clinical_department_permission(c.patient_id,null,'admission.manage',false) then raise exception 'Discharge checklist access denied.'; end if;
 if not exists(select 1 from jsonb_array_elements(c.items) as e(item) where e.item->>'key'=p_item_key) then raise exception 'Checklist item is not part of this checklist.'; end if;
 insert into public.discharge_checklist_answers(checklist_id,item_key,completed,note,recorded_by) values(c.id,p_item_key,p_completed,nullif(btrim(p_note),''),actor) returning id into answer_id;
 return answer_id;
end $$;

create or replace function public.override_discharge_checklist(p_admission_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare ctx record; actor uuid; result uuid;
begin
 select * into ctx from public.discharge_context(p_admission_id); select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if ctx.patient_id is null or actor is null or nullif(btrim(p_reason),'') is null or not public.has_any_role(array['super_admin','doctor']) or not public.has_clinical_department_permission(ctx.patient_id,null,'admission.manage',false) then raise exception 'Checklist override requires an authorized clinician and reason.'; end if;
 insert into public.discharge_checklist_overrides(admission_id,patient_id,facility_id,reason,authorized_by) values(p_admission_id,ctx.patient_id,ctx.facility_id,btrim(p_reason),actor) returning id into result; return result;
end $$;

create or replace function public.save_admission_discharge_summary(p_admission_id uuid,p_summary jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare ctx record; actor uuid; uid uuid; result uuid;
begin
 select * into ctx from public.discharge_context(p_admission_id); select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active'; uid:=auth.uid();
 if ctx.patient_id is null or actor is null or not public.has_any_role(array['super_admin','doctor']) or not public.has_clinical_department_permission(ctx.patient_id,null,'admission.manage',false) then raise exception 'Discharge summary access denied.'; end if;
 if not exists(select 1 from public.admissions where id=p_admission_id and status='active') then raise exception 'A discharge summary can only be prepared for an active admission.'; end if;
 if jsonb_typeof(p_summary)<>'object' or exists(select 1 from unnest(array['diagnosis','hospital_course','disposition','medication_reconciliation','follow_up','instructions','condition_at_discharge']) k where nullif(btrim(p_summary->>k),'') is null) then raise exception 'Complete all required structured discharge summary fields.'; end if;
 select id into result from public.admission_discharge_summaries where admission_id=p_admission_id and state='draft' and authored_by=actor for update;
 if result is null and exists(select 1 from public.admission_discharge_summaries where admission_id=p_admission_id and state='signed') then raise exception 'A signed discharge summary is immutable.'; end if;
 if result is null then insert into public.admission_discharge_summaries(admission_id,patient_id,encounter_id,facility_id,summary,authored_by,auth_user_id) values(p_admission_id,ctx.patient_id,ctx.encounter_id,ctx.facility_id,p_summary,actor,uid) returning id into result;
 else perform set_config('app.discharge_summary_save','on',true); update public.admission_discharge_summaries set summary=p_summary where id=result; end if;
 return result;
end $$;

create or replace function public.sign_admission_discharge_summary(p_summary_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare s public.admission_discharge_summaries%rowtype; actor uuid; result uuid;
begin
 select * into s from public.admission_discharge_summaries where id=p_summary_id for update;
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 if s.id is null or s.state<>'draft' or actor is null or not public.has_any_role(array['super_admin','doctor']) or (actor<>s.authored_by and not public.has_any_role(array['super_admin'])) or (actor<> (select doctor_id from public.admissions where id=s.admission_id) and not public.has_any_role(array['super_admin'])) or not public.has_clinical_department_permission(s.patient_id,null,'admission.manage',false) then raise exception 'Only the assigned summary author may sign this discharge summary.'; end if;
 perform set_config('app.discharge_summary_sign','on',true);
 update public.admission_discharge_summaries set state='signed',signed_at=now() where id=s.id;
 insert into public.admission_discharge_signatures(summary_id,admission_id,patient_id,signed_by,auth_user_id) values(s.id,s.admission_id,s.patient_id,actor,auth.uid()) returning id into result; return result;
end $$;

create or replace function public.discharge_requirements_met(p_admission uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.admission_discharge_summaries s join public.admission_discharge_signatures sig on sig.summary_id=s.id where s.admission_id=p_admission and s.state='signed')
 and (exists(select 1 from public.discharge_checklist_overrides o where o.admission_id=p_admission)
 or (exists(select 1 from public.discharge_checklists c where c.admission_id=p_admission)
 and not exists(select 1 from public.discharge_checklists c cross join lateral jsonb_array_elements(c.items) as e(item) where c.admission_id=p_admission and coalesce((e.item->>'required')::boolean,true)
 and not coalesce((select a.completed from public.discharge_checklist_answers a where a.checklist_id=c.id and a.item_key=e.item->>'key' order by a.recorded_at desc,a.id desc limit 1),false))
 and exists(select 1 from public.discharge_checklists c join public.admissions adm on adm.id=c.admission_id where c.admission_id=p_admission and (select a.completed from public.discharge_checklist_answers a where a.checklist_id=c.id and a.item_key='medication_reconciliation_completed' order by a.recorded_at desc,a.id desc limit 1)=true)
 and exists(select 1 from public.medication_reconciliations mr join public.admissions a on a.patient_id=mr.patient_id where a.id=p_admission and mr.transition_type='discharge' and mr.status in ('completed','not_required'))))
$$;

create or replace function public.guard_admission_discharge_summary() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'Discharge summaries cannot be deleted.'; end if;
 if old.state='signed' or old.authored_by is distinct from new.authored_by or old.admission_id is distinct from new.admission_id
   or old.patient_id is distinct from new.patient_id or old.auth_user_id is distinct from new.auth_user_id
   or (new.state='signed' and current_setting('app.discharge_summary_sign',true) is distinct from 'on')
   or (new.summary is distinct from old.summary and (old.state<>'draft' or current_setting('app.discharge_summary_save',true) is distinct from 'on')) then
   raise exception 'Signed discharge summary is immutable; draft changes must use the summary workflow.';
 end if;
 return new;
end $$;

create or replace function public.guard_admission_bed_transitions() returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() limit 1;
 if tg_op='INSERT' then if new.status<>'awaiting_bed' or new.bed_id is not null then raise exception 'Admission requests must wait for ward bed allocation.'; end if; return new; end if;
 if new.bed_id is distinct from old.bed_id and not (old.status='awaiting_bed' and new.status='active') then raise exception 'Beds may only be assigned through the ward allocation workflow.'; end if;
 if new.status is distinct from old.status then
  if old.status='awaiting_bed' and new.status='active' then
   if new.bed_id is null or not exists(select 1 from public.beds b where b.id=new.bed_id and b.status='occupied' and b.admission_id=new.id and b.bed_number=new.bed_number) then raise exception 'An available bed must be atomically allocated before admission.'; end if;
  elsif old.status='active' and new.status in ('discharged','transferred') then
   if nullif(trim(new.discharge_summary),'') is null or new.discharged_by is distinct from actor or new.discharged_at is null then raise exception 'An authorized disposition with summary and staff identity is required.'; end if;
   if new.status='discharged' and not public.discharge_requirements_met(new.id) then raise exception 'Discharge blocked: checklist must be complete or overridden, and the structured summary must be signed.'; end if;
   if new.status='discharged' and not public.has_any_role(array['super_admin','doctor']) then raise exception 'Only the treating clinician may authorize discharge.'; end if;
   if new.status='transferred' and not public.has_any_role(array['super_admin','doctor','nurse']) then raise exception 'Only the care team may authorize transfer.'; end if;
  else raise exception 'This inpatient status transition is not permitted.'; end if;
 end if; return new;
end $$;

create or replace function public.guard_bed_occupancy() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status='occupied' and (new.ward_id is distinct from old.ward_id or new.bed_number is distinct from old.bed_number) then raise exception 'An occupied bed cannot be moved or renumbered.'; end if;
 if new.status='occupied' then
  if new.admission_id is null or not exists(select 1 from public.admissions a where a.id=new.admission_id and a.status='awaiting_bed' and (a.requested_ward_id is null or a.requested_ward_id=new.ward_id)) then raise exception 'Bed occupation requires a matching pending admission request.'; end if;
 elsif new.status='available' and new.admission_id is not null then raise exception 'An available bed cannot retain an admission assignment.';
 elsif old.status='occupied' and new.status='available' and old.admission_id is not null then
  if not exists(select 1 from public.admissions where id=old.admission_id and status in ('discharged','transferred')) then raise exception 'Bed release requires a completed admission disposition.'; end if;
  if exists(select 1 from public.admissions where id=old.admission_id and status='discharged') and not public.discharge_requirements_met(old.admission_id) then raise exception 'Bed release blocked: complete the discharge checklist and sign the discharge summary.'; end if;
 end if; return new;
end $$;

do $$ declare t text; begin foreach t in array array['discharge_checklist_templates','discharge_checklists','discharge_checklist_answers','discharge_checklist_overrides','admission_discharge_summaries','admission_discharge_signatures'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from public,anon,authenticated',t); execute format('grant select on public.%I to authenticated',t); execute format('grant select,insert on public.%I to service_role',t);
 if t='discharge_checklist_templates' then execute format('create policy discharge_facility_read on public.%I for select to authenticated using (public.has_any_role(array[''super_admin'',''doctor'',''nurse'']) and (public.has_any_role(array[''super_admin'']) or exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.facility_id=%I.facility_id)))',t,t);
 elsif t='discharge_checklist_answers' then execute format('create policy discharge_patient_read on public.%I for select to authenticated using (exists(select 1 from public.discharge_checklists c where c.id=discharge_checklist_answers.checklist_id and public.has_patient_facility_access(c.patient_id) and public.has_clinical_department_permission(c.patient_id,null,''admission.manage'',false)))',t);
 else execute format('create policy discharge_patient_read on public.%I for select to authenticated using (public.has_patient_facility_access(patient_id) and public.has_clinical_department_permission(patient_id,null,''admission.manage'',false))',t); end if;
 execute format('create trigger audit_%I after insert on public.%I for each row execute function public.audit_row_change()',t,t);
 end loop; end $$;
create trigger discharge_answers_immutable before update or delete on public.discharge_checklist_answers for each row execute function public.prevent_consultation_history_mutation();
create trigger discharge_overrides_immutable before update or delete on public.discharge_checklist_overrides for each row execute function public.prevent_consultation_history_mutation();
create trigger discharge_signatures_immutable before update or delete on public.admission_discharge_signatures for each row execute function public.prevent_consultation_history_mutation();
create trigger discharge_summaries_guard before update or delete on public.admission_discharge_summaries for each row execute function public.guard_admission_discharge_summary();
create trigger audit_discharge_summary_update after update on public.admission_discharge_summaries for each row execute function public.audit_row_change();
revoke all on function public.configure_discharge_checklist(uuid,jsonb),public.ensure_discharge_checklist(uuid),public.record_discharge_checklist_answer(uuid,text,boolean,text),public.override_discharge_checklist(uuid,text),public.save_admission_discharge_summary(uuid,jsonb),public.sign_admission_discharge_summary(uuid) from public,anon;
grant execute on function public.configure_discharge_checklist(uuid,jsonb),public.ensure_discharge_checklist(uuid),public.record_discharge_checklist_answer(uuid,text,boolean,text),public.override_discharge_checklist(uuid,text),public.save_admission_discharge_summary(uuid,jsonb),public.sign_admission_discharge_summary(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
