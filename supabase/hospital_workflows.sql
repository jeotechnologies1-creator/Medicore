-- Additive workflow support for emergency and Brought In Dead (BID/BOD) intake.
-- Apply after role_authorization.sql. Existing encounter identifiers/statuses are preserved.

alter table public.encounters
  add column if not exists case_type text not null default 'routine',
  add column if not exists arrival_mode text,
  add column if not exists referral_source text,
  add column if not exists accompanying_person text,
  add column if not exists presenting_emergency text,
  add column if not exists triage_priority text not null default 'routine',
  add column if not exists death_assessment_status text,
  add column if not exists death_assessment_notes text,
  add column if not exists disposition text;

alter table public.encounters drop constraint if exists encounters_case_type_check;
alter table public.encounters add constraint encounters_case_type_check
  check (case_type in ('routine','emergency','bid')) not valid;
alter table public.encounters drop constraint if exists encounters_triage_priority_check;
alter table public.encounters add constraint encounters_triage_priority_check
  check (triage_priority in ('routine','urgent','emergency','immediate')) not valid;
alter table public.encounters drop constraint if exists encounters_death_assessment_status_check;
alter table public.encounters add constraint encounters_death_assessment_status_check
  check (death_assessment_status is null or death_assessment_status in ('assessment_required','under_assessment','death_confirmed','not_confirmed','further_assessment')) not valid;

create table if not exists public.encounter_workflow_events (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  department text not null,
  notes text,
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists encounter_workflow_events_timeline_idx
  on public.encounter_workflow_events(encounter_id, created_at);
alter table public.encounter_workflow_events enable row level security;
revoke all on public.encounter_workflow_events from anon;
grant select, insert on public.encounter_workflow_events to authenticated;
drop policy if exists "authorized read encounter workflow" on public.encounter_workflow_events;
drop policy if exists "staff record encounter workflow" on public.encounter_workflow_events;
create policy "authorized read encounter workflow" on public.encounter_workflow_events for select
  using (public.can_read_patient_record(patient_id));
create policy "staff record encounter workflow" on public.encounter_workflow_events for insert
  with check (
    public.has_any_role(array['super_admin','records_officer','receptionist','doctor','nurse'])
    and actor_id = (select id from public.profiles where auth_user_id = auth.uid() limit 1)
    and exists (select 1 from public.encounters e where e.id = encounter_id and e.patient_id = patient_id)
  );
revoke update, delete, truncate, references, trigger on public.encounter_workflow_events from authenticated;

-- HIM and reception may create an encounter only in the initial arrived state.
-- Clinical edits remain restricted to the clinician roles from role_authorization.sql.
drop policy if exists "authorized clinical manage" on public.encounters;
drop policy if exists "authorized clinical read encounters" on public.encounters;
drop policy if exists "clinical manage encounters" on public.encounters;
drop policy if exists "HIM register encounters" on public.encounters;
create policy "authorized clinical read encounters" on public.encounters for select
  using (public.can_read_patient_record(patient_id));
create policy "clinical manage encounters" on public.encounters for all
  using (public.has_any_role(array['super_admin','doctor','nurse']))
  with check (public.has_any_role(array['super_admin','doctor','nurse']));
create policy "HIM register encounters" on public.encounters for insert
  with check (
    public.has_any_role(array['super_admin','records_officer','receptionist','doctor','nurse'])
    and status = 'arrived'
    and ended_at is null
    and ((case_type <> 'bid' and death_assessment_status is null)
      or (case_type = 'bid' and death_assessment_status = 'assessment_required'))
  );

create or replace function public.guard_death_assessment_authority() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.case_type = 'bid' and new.death_assessment_status is distinct from 'assessment_required' then
      raise exception 'BID/BOD registration must remain pending clinical assessment.';
    end if;
    if new.case_type <> 'bid' and new.death_assessment_status is not null then
      raise exception 'Death assessment fields are only valid for a BID/BOD encounter.';
    end if;
    return new;
  end if;
  if new.death_assessment_status is distinct from old.death_assessment_status
     or new.death_assessment_notes is distinct from old.death_assessment_notes
     or new.disposition is distinct from old.disposition then
    if not public.has_any_role(array['super_admin','doctor']) then
      raise exception 'Only an authorized clinician may record a BID/BOD assessment or disposition.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_death_assessment_authority on public.encounters;
create trigger guard_death_assessment_authority before insert or update on public.encounters
  for each row execute function public.guard_death_assessment_authority();

create or replace function public.prevent_encounter_workflow_event_mutation() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Encounter workflow history is append-only.';
end;
$$;
drop trigger if exists encounter_workflow_event_no_mutation on public.encounter_workflow_events;
create trigger encounter_workflow_event_no_mutation before update or delete on public.encounter_workflow_events
  for each row execute function public.prevent_encounter_workflow_event_mutation();

notify pgrst, 'reload schema';
