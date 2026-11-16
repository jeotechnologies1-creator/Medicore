begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

alter table public.consultations
  add column if not exists note_state text not null default 'draft' check(note_state in ('draft','signed'));

create table if not exists public.consultation_signatures (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references public.consultations(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  signed_at timestamptz not null default now()
);
create table if not exists public.consultation_addenda (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id) on delete restrict,
  encounter_id uuid not null references public.encounters(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check(length(btrim(reason))>0),
  content text not null check(length(btrim(content))>0),
  created_at timestamptz not null default now()
);
create index if not exists consultation_addenda_history_idx on public.consultation_addenda(consultation_id,created_at,id);

alter table public.consultation_signatures enable row level security;
alter table public.consultation_addenda enable row level security;
revoke all on public.consultation_signatures,public.consultation_addenda from public,anon;
grant select on public.consultation_signatures,public.consultation_addenda to authenticated;
grant select,insert on public.consultation_signatures,public.consultation_addenda to service_role;
create policy "clinical staff read consultation signatures" on public.consultation_signatures for select to authenticated
  using(exists(select 1 from public.consultations c where c.id=consultation_id and public.has_clinical_department_permission(c.patient_id,'Medical','encounter.update',false)));
create policy "clinical staff read consultation addenda" on public.consultation_addenda for select to authenticated
  using(exists(select 1 from public.consultations c where c.id=consultation_id and public.has_clinical_department_permission(c.patient_id,'Medical','encounter.update',false)));

create or replace function public.guard_signed_consultation() returns trigger language plpgsql security definer set search_path=public as $$
declare encounter_patient uuid; actor_profile uuid;
begin
  if tg_op='DELETE' then
    if old.note_state='signed' then raise exception 'Signed consultation notes cannot be deleted; record a reasoned addendum.'; end if;
    raise exception 'Consultation notes cannot be deleted; retain the draft history.';
  end if;
  if old.note_state='signed' then raise exception 'Signed consultation notes are immutable; record a reasoned addendum.'; end if;
  if new.patient_id is distinct from old.patient_id and tg_op='UPDATE' then raise exception 'Consultation patient context is immutable.'; end if;
  if new.encounter_id is null or new.doctor_id is null then raise exception 'Encounter context and author are required for consultation notes.'; end if;
  select patient_id into encounter_patient from public.encounters where id=new.encounter_id;
  if encounter_patient is distinct from new.patient_id then raise exception 'Consultation encounter must belong to the selected patient.'; end if;
  select id into actor_profile from public.profiles where auth_user_id=auth.uid() and status::text='active';
  if auth.uid() is not null and (actor_profile is null or new.doctor_id is distinct from actor_profile) then raise exception 'Consultation author must be the authenticated active clinician.'; end if;
  if auth.uid() is not null and not public.has_clinical_department_permission(new.patient_id,'Medical','encounter.update',false) then raise exception 'Consultation facility access denied.'; end if;
  if new.note_state='signed' and not exists(select 1 from public.consultation_signatures s where s.consultation_id=new.id and s.author_id=new.doctor_id and s.auth_user_id=auth.uid()) then
    raise exception 'Use the consultation signing workflow to create a signature.';
  end if;
  return new;
end $$;
revoke all on function public.guard_signed_consultation() from public,anon,authenticated;
drop trigger if exists guard_signed_consultation on public.consultations;
create trigger guard_signed_consultation before insert or update or delete on public.consultations for each row execute function public.guard_signed_consultation();

create or replace function public.prevent_consultation_history_mutation() returns trigger language plpgsql as $$
begin raise exception 'Consultation signatures and addenda are append-only.'; end $$;
revoke all on function public.prevent_consultation_history_mutation() from public,anon,authenticated;
create trigger consultation_signatures_immutable before update or delete on public.consultation_signatures for each row execute function public.prevent_consultation_history_mutation();
create trigger consultation_addenda_immutable before update or delete on public.consultation_addenda for each row execute function public.prevent_consultation_history_mutation();

create or replace function public.sign_consultation(p_consultation_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare note public.consultations%rowtype; actor uuid; signature_id uuid;
begin
  if not public.has_any_role(array['super_admin','doctor','specialist']) then raise exception 'Only an authorized clinician may sign a consultation.'; end if;
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
  select * into note from public.consultations where id=p_consultation_id for update;
  if not found or note.encounter_id is null or note.doctor_id is null then raise exception 'Consultation requires an encounter and author before signing.'; end if;
  if note.doctor_id<>actor then raise exception 'Only the assigned note author may sign this consultation.'; end if;
  if not public.has_clinical_department_permission(note.patient_id,'Medical','encounter.update',false) then raise exception 'Consultation facility access denied.'; end if;
  if note.note_state<>'draft' then raise exception 'Consultation is already signed.'; end if;
  insert into public.consultation_signatures(consultation_id,author_id,auth_user_id) values(note.id,actor,auth.uid()) returning id into signature_id;
  update public.consultations set note_state='signed',status='completed' where id=note.id;
  return signature_id;
end $$;
revoke all on function public.sign_consultation(uuid) from public,anon;
grant execute on function public.sign_consultation(uuid) to authenticated;

create or replace function public.add_consultation_addendum(p_consultation_id uuid,p_reason text,p_content text) returns uuid language plpgsql security definer set search_path=public as $$
declare note public.consultations%rowtype; actor uuid; addendum_id uuid;
begin
  if not public.has_any_role(array['super_admin','doctor','specialist']) then raise exception 'Only an authorized clinician may add to a consultation.'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A correction reason is required.'; end if;
  if nullif(btrim(p_content),'') is null then raise exception 'Addendum content is required.'; end if;
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
  select * into note from public.consultations where id=p_consultation_id;
  if not found or note.note_state<>'signed' or note.encounter_id is null then raise exception 'A signed consultation with encounter context is required.'; end if;
  if not public.has_clinical_department_permission(note.patient_id,'Medical','encounter.update',false) then raise exception 'Consultation facility access denied.'; end if;
  insert into public.consultation_addenda(consultation_id,encounter_id,author_id,auth_user_id,reason,content)
  values(note.id,note.encounter_id,actor,auth.uid(),btrim(p_reason),btrim(p_content)) returning id into addendum_id;
  return addendum_id;
end $$;
revoke all on function public.add_consultation_addendum(uuid,text,text) from public,anon;
grant execute on function public.add_consultation_addendum(uuid,text,text) to authenticated;

drop trigger if exists audit_consultations on public.consultations;
drop trigger if exists audit_consultation_signatures on public.consultation_signatures;
drop trigger if exists audit_consultation_addenda on public.consultation_addenda;
create trigger audit_consultations after insert or update or delete on public.consultations for each row execute function public.audit_row_change();
create trigger audit_consultation_signatures after insert on public.consultation_signatures for each row execute function public.audit_row_change();
create trigger audit_consultation_addenda after insert on public.consultation_addenda for each row execute function public.audit_row_change();

notify pgrst,'reload schema';
commit;
