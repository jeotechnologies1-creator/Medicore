-- Rollback plan: pause laboratory result entry, export relevant notification and
-- acknowledgement records, and verify the prior schema is available in staging.
-- This removes only the critical-result trigger and restores the prior
-- acknowledgement trigger behavior. Existing notifications/acknowledgements remain.
begin;
set local lock_timeout = '2s';
drop trigger if exists notify_critical_lab_result on public.lab_orders;
drop function if exists public.notify_critical_lab_result();

create or replace function public.queue_result_acknowledgement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  result_kind text := tg_argv[0];
  is_final boolean;
begin
  is_final := case
    when result_kind = 'laboratory' then new.result_status in ('final', 'corrected') or new.status = 'completed'
    else new.report_status in ('final', 'amended') or new.status = 'reported'
  end;
  if is_final then
    insert into public.result_acknowledgements (result_type, result_id, patient_id, responsible_clinician_id, due_at)
    values (result_kind, new.id, new.patient_id, coalesce(new.responsible_clinician_id, new.doctor_id), now() + interval '24 hours')
    on conflict (result_type, result_id) do update
      set responsible_clinician_id = coalesce(excluded.responsible_clinician_id, result_acknowledgements.responsible_clinician_id),
          due_at = excluded.due_at,
          updated_at = now();
  end if;
  return new;
end;
$$;
drop trigger if exists queue_lab_result_acknowledgement on public.lab_orders;
create trigger queue_lab_result_acknowledgement
  after insert or update of status, result_status, responsible_clinician_id on public.lab_orders
  for each row execute function public.queue_result_acknowledgement('laboratory');
commit;
notify pgrst, 'reload schema';
