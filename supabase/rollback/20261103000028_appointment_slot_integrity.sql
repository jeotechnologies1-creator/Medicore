-- Remove appointment conflict enforcement if the workflow must be rolled back.
begin;
set local lock_timeout='2s';
drop trigger if exists guard_appointment_slot_conflict on public.appointments;
drop function if exists public.guard_appointment_slot_conflict();
commit;
notify pgrst,'reload schema';
