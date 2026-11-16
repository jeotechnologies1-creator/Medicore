begin;
do $$ begin
 if exists(select 1 from public.discharge_checklists) or exists(select 1 from public.discharge_checklist_answers)
  or exists(select 1 from public.discharge_checklist_overrides) or exists(select 1 from public.admission_discharge_summaries)
  or exists(select 1 from public.admission_discharge_signatures) then
  raise exception 'Rollback refused: discharge planning records exist; retain their clinical history.';
 end if;
end $$;
drop function if exists public.guard_admission_discharge_summary();
drop function if exists public.discharge_requirements_met(uuid);
drop function if exists public.sign_admission_discharge_summary(uuid);
drop function if exists public.save_admission_discharge_summary(uuid,jsonb);
drop function if exists public.override_discharge_checklist(uuid,text);
drop function if exists public.record_discharge_checklist_answer(uuid,text,boolean,text);
drop function if exists public.ensure_discharge_checklist(uuid);
drop function if exists public.configure_discharge_checklist(uuid,jsonb);
drop function if exists public.discharge_context(uuid);
drop table public.admission_discharge_signatures;
drop table public.admission_discharge_summaries;
drop table public.discharge_checklist_overrides;
drop table public.discharge_checklist_answers;
drop table public.discharge_checklists;
drop table public.discharge_checklist_templates;
create or replace function public.guard_admission_bed_transitions() returns trigger
language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() limit 1;
 if tg_op='INSERT' then
  if new.status <> 'awaiting_bed' or new.bed_id is not null then raise exception 'Admission requests must wait for ward bed allocation.'; end if; return new;
 end if;
 if new.bed_id is distinct from old.bed_id and not (old.status='awaiting_bed' and new.status='active') then raise exception 'Beds may only be assigned through the ward allocation workflow.'; end if;
 if new.status is distinct from old.status then
  if old.status='awaiting_bed' and new.status='active' then
   if new.bed_id is null or not exists(select 1 from public.beds b where b.id=new.bed_id and b.status='occupied' and b.admission_id=new.id and b.bed_number=new.bed_number) then raise exception 'An available bed must be atomically allocated before admission.'; end if;
  elsif old.status='active' and new.status in ('discharged','transferred') then
   if nullif(trim(new.discharge_summary),'') is null or new.discharged_by is distinct from actor or new.discharged_at is null then raise exception 'An authorized disposition with summary and staff identity is required.'; end if;
   if new.status='discharged' and not public.has_any_role(array['super_admin','doctor']) then raise exception 'Only the treating clinician may authorize discharge.'; end if;
   if new.status='transferred' and not public.has_any_role(array['super_admin','doctor','nurse']) then raise exception 'Only the care team may authorize transfer.'; end if;
  else raise exception 'This inpatient status transition is not permitted.'; end if;
 end if; return new;
end $$;
create or replace function public.guard_bed_occupancy() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if old.status='occupied' and (new.ward_id is distinct from old.ward_id or new.bed_number is distinct from old.bed_number) then raise exception 'An occupied bed cannot be moved or renumbered.'; end if;
 if new.status='occupied' then
  if new.admission_id is null or not exists(select 1 from public.admissions a where a.id=new.admission_id and a.status='awaiting_bed' and (a.requested_ward_id is null or a.requested_ward_id=new.ward_id)) then raise exception 'Bed occupation requires a matching pending admission request.'; end if;
 elsif new.status='available' and new.admission_id is not null then raise exception 'An available bed cannot retain an admission assignment.';
 elsif old.status='occupied' and new.status='available' and old.admission_id is not null and not exists(select 1 from public.admissions where id=old.admission_id and status in ('discharged','transferred')) then raise exception 'Bed release requires a completed admission disposition.';
 end if; return new;
end $$;
notify pgrst,'reload schema';
commit;
