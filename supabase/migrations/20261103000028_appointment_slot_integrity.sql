-- Prevent exact-slot double booking for a doctor or patient.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create or replace function public.guard_appointment_slot_conflict()
returns trigger language plpgsql security definer set search_path=public as $$
declare slot_key text;
begin
  if new.status <> 'scheduled' then return new; end if;
  if new.patient_id is null or new.doctor_id is null or new.appointment_date is null
     or nullif(trim(new.appointment_time),'') is null then
    raise exception 'A scheduled appointment requires a patient, doctor, date, and time.';
  end if;
  slot_key := new.appointment_date::text || ':' || lower(trim(new.appointment_time));
  perform pg_advisory_xact_lock(hashtextextended('appointment-doctor:'||new.doctor_id::text||':'||slot_key,0));
  perform pg_advisory_xact_lock(hashtextextended('appointment-patient:'||new.patient_id::text||':'||slot_key,0));
  if exists (
    select 1 from public.appointments existing
    where existing.status='scheduled' and existing.appointment_date=new.appointment_date
      and lower(trim(existing.appointment_time))=lower(trim(new.appointment_time))
      and existing.id is distinct from new.id
      and (existing.doctor_id=new.doctor_id or existing.patient_id=new.patient_id)
  ) then raise exception 'The patient or doctor already has an appointment at this date and time.'; end if;
  return new;
end $$;

revoke all on function public.guard_appointment_slot_conflict() from public,anon,authenticated;
drop trigger if exists guard_appointment_slot_conflict on public.appointments;
create trigger guard_appointment_slot_conflict
before insert or update of patient_id,doctor_id,appointment_date,appointment_time,status
on public.appointments for each row execute function public.guard_appointment_slot_conflict();

commit;
notify pgrst,'reload schema';
