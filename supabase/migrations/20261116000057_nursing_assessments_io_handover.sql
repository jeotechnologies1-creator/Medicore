begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

alter table public.wards add column if not exists facility_id uuid references public.facilities(id) on delete restrict;
create index if not exists wards_facility_idx on public.wards(facility_id);

create table public.nursing_admission_assessments (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete restrict,
 admission_id uuid not null references public.admissions(id) on delete restrict, encounter_id uuid not null references public.encounters(id) on delete restrict,
 ward_id uuid not null references public.wards(id) on delete restrict, author_id uuid not null references public.profiles(id) on delete restrict,
 auth_user_id uuid not null references auth.users(id) on delete restrict, assessed_at timestamptz not null default now(),
 assessment jsonb not null default '{}'::jsonb, scoring_tool text, scoring_value jsonb,
 created_at timestamptz not null default now(), check(jsonb_typeof(assessment)='object'));
create table public.nursing_care_interventions (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete restrict,
 admission_id uuid references public.admissions(id) on delete restrict, encounter_id uuid not null references public.encounters(id) on delete restrict,
 ward_id uuid not null references public.wards(id) on delete restrict, author_id uuid not null references public.profiles(id) on delete restrict,
 auth_user_id uuid not null references auth.users(id) on delete restrict, intervention text not null check(length(btrim(intervention))>0),
 outcome text, performed_at timestamptz not null default now(), created_at timestamptz not null default now());
create table public.nursing_fluid_entries (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete restrict,
 admission_id uuid references public.admissions(id) on delete restrict, encounter_id uuid not null references public.encounters(id) on delete restrict,
 ward_id uuid not null references public.wards(id) on delete restrict, author_id uuid not null references public.profiles(id) on delete restrict,
 auth_user_id uuid not null references auth.users(id) on delete restrict, entry_type text not null check(entry_type in ('intake','output')),
 amount_ml numeric(10,2) not null check(amount_ml>=0), category text not null, recorded_at timestamptz not null default now(), note text,
 created_at timestamptz not null default now());
create table public.nursing_shift_handovers (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete restrict,
 admission_id uuid not null references public.admissions(id) on delete restrict, encounter_id uuid not null references public.encounters(id) on delete restrict,
 ward_id uuid not null references public.wards(id) on delete restrict, outgoing_nurse_id uuid not null references public.profiles(id) on delete restrict,
 auth_user_id uuid not null references auth.users(id) on delete restrict, incoming_nurse_id uuid not null references public.profiles(id) on delete restrict,
 handover jsonb not null check(jsonb_typeof(handover)='object'), handed_over_at timestamptz not null default now(),
 acknowledged_by uuid references public.profiles(id) on delete restrict, acknowledged_at timestamptz,
 created_at timestamptz not null default now(), check((acknowledged_by is null)=(acknowledged_at is null)));
create table public.nursing_amendments (
 id uuid primary key default gen_random_uuid(), record_type text not null check(record_type in ('assessment','intervention','fluid','handover')),
 record_id uuid not null, patient_id uuid not null references public.patients(id) on delete restrict, ward_id uuid not null references public.wards(id) on delete restrict,
 author_id uuid not null references public.profiles(id) on delete restrict, auth_user_id uuid not null references auth.users(id) on delete restrict,
 reason text not null check(length(btrim(reason))>0), correction jsonb not null check(jsonb_typeof(correction)='object'), created_at timestamptz not null default now());
create index nursing_fluid_running_idx on public.nursing_fluid_entries(admission_id,recorded_at,id);
create index nursing_handover_alert_idx on public.nursing_shift_handovers(ward_id,handed_over_at) where acknowledged_at is null;

do $$ declare t text; author_column text; encounter_clause text; begin foreach t in array array['nursing_admission_assessments','nursing_care_interventions','nursing_fluid_entries','nursing_shift_handovers','nursing_amendments'] loop
 author_column := case when t='nursing_shift_handovers' then 'outgoing_nurse_id' else 'author_id' end;
 encounter_clause := case when t='nursing_amendments' then ')' else ' and exists(select 1 from public.encounters e where e.id=encounter_id and e.patient_id=patient_id))' end;
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon',t);
 execute format('grant select,insert on public.%I to authenticated',t);
 execute format('grant select,insert on public.%I to service_role',t);
 execute format('create policy nursing_read on public.%I for select to authenticated using (public.has_clinical_department_permission(patient_id,''Nursing'',''observation.record'',false) and exists(select 1 from public.wards w join public.patients p on p.id=patient_id where w.id=ward_id and w.facility_id=coalesce(p.home_facility_id,(select pr.facility_id from public.profiles pr where pr.auth_user_id=auth.uid()))))',t);
 execute format('create policy nursing_insert on public.%I for insert to authenticated with check (auth_user_id=auth.uid() and %I=(select id from public.profiles where auth_user_id=auth.uid() and status::text=''active'') and public.has_clinical_department_permission(patient_id,''Nursing'',''observation.record'',false) and exists(select 1 from public.wards w join public.patients p on p.id=patient_id where w.id=ward_id and w.facility_id=coalesce(p.home_facility_id,(select pr.facility_id from public.profiles pr where pr.auth_user_id=auth.uid())))%s',t,author_column,encounter_clause);
 execute format('create trigger %I before update or delete on public.%I for each row execute function public.prevent_consultation_history_mutation()',t||'_immutable',t);
 end loop; end $$;
revoke insert on public.nursing_amendments from authenticated;

create or replace function public.acknowledge_nursing_handover(p_handover_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare h public.nursing_shift_handovers%rowtype; actor uuid;
begin
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 select * into h from public.nursing_shift_handovers where id=p_handover_id for update;
 if not found or h.acknowledged_at is not null then raise exception 'Handover is unavailable or already acknowledged.'; end if;
 if h.incoming_nurse_id<>actor then raise exception 'Only the assigned incoming nurse may acknowledge.'; end if;
 if not public.has_clinical_department_permission(h.patient_id,'Nursing','observation.record',false) then raise exception 'Nursing facility access denied.'; end if;
 update public.nursing_shift_handovers set acknowledged_by=actor,acknowledged_at=now() where id=h.id;
end $$;

create or replace function public.validate_nursing_context() returns trigger language plpgsql security definer set search_path=public as $$
declare encounter_patient uuid; admission_patient uuid; patient_facility uuid; ward_facility uuid;
begin
 select patient_id into encounter_patient from public.encounters where id=new.encounter_id;
 if encounter_patient is distinct from new.patient_id then raise exception 'Nursing encounter must belong to the selected patient.'; end if;
 if new.admission_id is not null then
   select patient_id into admission_patient from public.admissions where id=new.admission_id;
   if admission_patient is distinct from new.patient_id then raise exception 'Nursing admission must belong to the selected patient.'; end if;
 end if;
 select home_facility_id into patient_facility from public.patients where id=new.patient_id;
 if patient_facility is null then select facility_id into patient_facility from public.profiles where auth_user_id=auth.uid(); end if;
 select facility_id into ward_facility from public.wards where id=new.ward_id;
 if ward_facility is null or ward_facility is distinct from patient_facility then raise exception 'Nursing ward must be assigned to the patient facility.'; end if;
 return new;
end $$;
do $$ declare t text; begin foreach t in array array['nursing_admission_assessments','nursing_care_interventions','nursing_fluid_entries','nursing_shift_handovers'] loop
 execute format('create trigger %I before insert on public.%I for each row execute function public.validate_nursing_context()',t||'_validate_context',t);
end loop; end $$;
create or replace function public.guard_nursing_handover_ack() returns trigger language plpgsql as $$
begin
 if tg_op<>'UPDATE' or old.acknowledged_at is not null or new.acknowledged_at is null
   or (to_jsonb(new)-array['acknowledged_by','acknowledged_at']) is distinct from (to_jsonb(old)-array['acknowledged_by','acknowledged_at']) then
   raise exception 'Handover content is immutable; only its acknowledgement may be recorded.';
 end if;
 return new;
end $$;
drop trigger nursing_shift_handovers_immutable on public.nursing_shift_handovers;
create trigger nursing_shift_handovers_immutable before update or delete on public.nursing_shift_handovers for each row execute function public.guard_nursing_handover_ack();
revoke all on function public.acknowledge_nursing_handover(uuid) from public,anon;
grant execute on function public.acknowledge_nursing_handover(uuid) to authenticated;

create or replace function public.add_nursing_amendment(p_record_type text,p_record_id uuid,p_reason text,p_correction jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare target_patient uuid; target_ward uuid; actor uuid; amendment_id uuid;
begin
 if nullif(btrim(p_reason),'') is null or jsonb_typeof(p_correction)<>'object' then raise exception 'A reason and structured correction are required.'; end if;
 select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active';
 case p_record_type when 'assessment' then select patient_id,ward_id into target_patient,target_ward from public.nursing_admission_assessments where id=p_record_id;
 when 'intervention' then select patient_id,ward_id into target_patient,target_ward from public.nursing_care_interventions where id=p_record_id;
 when 'fluid' then select patient_id,ward_id into target_patient,target_ward from public.nursing_fluid_entries where id=p_record_id;
 when 'handover' then select patient_id,ward_id into target_patient,target_ward from public.nursing_shift_handovers where id=p_record_id;
 else raise exception 'Unsupported nursing record type.'; end case;
 if target_patient is null or not public.has_clinical_department_permission(target_patient,'Nursing','observation.record',false) then raise exception 'Nursing facility access denied.'; end if;
 insert into public.nursing_amendments(record_type,record_id,patient_id,ward_id,author_id,auth_user_id,reason,correction) values(p_record_type,p_record_id,target_patient,target_ward,actor,auth.uid(),btrim(p_reason),p_correction) returning id into amendment_id;
 return amendment_id;
end $$;
revoke all on function public.add_nursing_amendment(text,uuid,text,jsonb) from public,anon;
grant execute on function public.add_nursing_amendment(text,uuid,text,jsonb) to authenticated;

create or replace view public.nursing_fluid_running_totals with (security_invoker=true) as
select e.*, sum(case when entry_type='intake' then amount_ml else 0-amount_ml end) over(partition by admission_id order by recorded_at,id rows unbounded preceding) as running_balance_ml
from public.nursing_fluid_entries e;
create or replace view public.nursing_ward_alerts with (security_invoker=true) as
select id,ward_id,patient_id,admission_id,encounter_id,outgoing_nurse_id,incoming_nurse_id,handed_over_at,handed_over_at as created_at
from public.nursing_shift_handovers where acknowledged_at is null;
grant select on public.nursing_fluid_running_totals,public.nursing_ward_alerts to authenticated,service_role;
notify pgrst,'reload schema';
commit;
