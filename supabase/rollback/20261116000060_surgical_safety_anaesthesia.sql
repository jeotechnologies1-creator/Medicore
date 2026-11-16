begin;
do $$ begin
 if exists(select 1 from public.surgical_checklist_templates) or exists(select 1 from public.surgical_checklist_instances)
   or exists(select 1 from public.surgical_checklist_answers) or exists(select 1 from public.surgical_checklist_completions)
   or exists(select 1 from public.surgery_anaesthesia_events) or exists(select 1 from public.surgery_recovery_observations)
   or exists(select 1 from public.surgery_consumable_reconciliations) then
   raise exception 'Unsafe rollback refused: surgical safety or anaesthesia history exists; preserve the audit trail and fix forward.';
 end if;
end $$;

create or replace function public.guard_surgery_workflow() returns trigger
language plpgsql security definer set search_path=public as $$
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
  if new.status='in-progress' then new.started_at := coalesce(new.started_at,now()); end if;
  if new.status='completed' then
    if nullif(trim(new.operative_notes),'') is null or nullif(trim(new.postoperative_plan),'') is null then raise exception 'Operative notes and a postoperative plan are required before completing surgery.'; end if;
    new.ended_at := coalesce(new.ended_at,now());
  end if;
  return new;
end;
$$;
drop trigger if exists guard_surgery_workflow on public.surgeries;
create trigger guard_surgery_workflow before insert or update on public.surgeries for each row execute function public.guard_surgery_workflow();

drop function if exists public.reconcile_surgery_consumable(uuid,text,integer,integer,text);
drop function if exists public.add_surgery_recovery_observation(uuid,jsonb);
drop function if exists public.record_surgery_anaesthesia_agent(uuid,text,text,numeric,text,text,timestamptz);
drop function if exists public.add_surgery_anaesthesia_event(uuid,text,jsonb);
drop function if exists public.complete_surgical_checklist(uuid);
drop function if exists public.answer_surgical_checklist_item(uuid,text,boolean,text);
drop function if exists public.create_surgical_checklist_instance(uuid,text);
drop function if exists public.set_surgical_checklist_template(uuid,text,jsonb);
drop function if exists public.has_completed_surgical_checklist(uuid,uuid,text);
drop table if exists public.surgery_consumable_reconciliations;
drop table if exists public.surgery_recovery_observations;
drop table if exists public.surgery_anaesthesia_events;
drop table if exists public.surgical_checklist_completions;
drop table if exists public.surgical_checklist_answers;
drop table if exists public.surgical_checklist_instances;
drop table if exists public.surgical_checklist_templates;
drop function if exists public.can_access_surgery(uuid,text);
delete from public.role_permission_grants where permission_key in ('surgery.checklist.configure','surgery.checklist.complete','surgery.anaesthesia.record');
delete from public.permission_catalog where permission_key in ('surgery.checklist.configure','surgery.checklist.complete','surgery.anaesthesia.record');
notify pgrst,'reload schema';
commit;
