-- Route finalized critical laboratory results to the responsible clinician
-- through the existing in-app notification feed. No external delivery is used.
-- Apply in staging first and verify notification recipient RLS and result correction.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create or replace function public.queue_result_acknowledgement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  result_kind text := tg_argv[0];
  is_final boolean;
  meaningful_change boolean := true;
begin
  if tg_op = 'UPDATE' then
    if result_kind = 'laboratory' then
      meaningful_change := new.status is distinct from old.status
        or new.result_status is distinct from old.result_status
        or new.responsible_clinician_id is distinct from old.responsible_clinician_id
        or new.results is distinct from old.results;
    else
      meaningful_change := new.status is distinct from old.status
        or new.report_status is distinct from old.report_status
        or new.responsible_clinician_id is distinct from old.responsible_clinician_id;
    end if;
  end if;
  if not meaningful_change then return new; end if;

  is_final := case
    when result_kind = 'laboratory' then new.result_status in ('final', 'corrected') or new.status = 'completed'
    else new.report_status in ('final', 'amended') or new.status = 'reported'
  end;
  if is_final then
    insert into public.result_acknowledgements (result_type, result_id, patient_id, responsible_clinician_id, due_at)
    values (result_kind, new.id, new.patient_id, coalesce(new.responsible_clinician_id, new.doctor_id), now() + interval '24 hours')
    on conflict (result_type, result_id) do update
      set responsible_clinician_id = coalesce(excluded.responsible_clinician_id, result_acknowledgements.responsible_clinician_id),
          status = 'unacknowledged', due_at = excluded.due_at,
          acknowledged_at = null, acknowledged_by = null,
          escalation_at = null, escalation_reason = null,
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists queue_lab_result_acknowledgement on public.lab_orders;
create trigger queue_lab_result_acknowledgement
  after insert or update on public.lab_orders
  for each row execute function public.queue_result_acknowledgement('laboratory');

create or replace function public.notify_critical_lab_result() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_critical boolean;
  recipient_id uuid;
begin
  if tg_op = 'UPDATE'
     and new.results is not distinct from old.results
     and new.result_status is not distinct from old.result_status
     and new.status is not distinct from old.status
     and new.responsible_clinician_id is not distinct from old.responsible_clinician_id then
    return new;
  end if;

  if new.result_status not in ('final', 'corrected') then return new; end if;
  is_critical := new.status = 'critical' or case
    when jsonb_typeof(new.results->'values') = 'array' then exists (
      select 1
      from jsonb_array_elements(new.results->'values') as elements(value)
      where lower(coalesce(elements.value->>'flag', '')) = 'critical'
    )
    else false
  end;
  if not is_critical then return new; end if;

  recipient_id := coalesce(new.responsible_clinician_id, new.doctor_id);
  if recipient_id is not null and exists (
    select 1 from public.profiles p where p.id = recipient_id and p.status::text = 'active'
  ) then
    insert into public.notifications(user_id, type, title, message, priority)
    values (recipient_id, 'critical_lab_result', 'Critical laboratory result requires review',
      format('A critical result for laboratory order %s requires your review in the Laboratory module.', new.id), 'urgent');
  else
    -- Legacy orders without an active assigned clinician go to active Super Admins.
    insert into public.notifications(user_id, type, title, message, priority)
    select p.id, 'critical_lab_result', 'Unassigned critical laboratory result',
      format('Critical laboratory order %s has no active responsible clinician. Assign one and review it in the Laboratory module.', new.id), 'urgent'
    from public.profiles p
    where p.role::text = 'super_admin' and p.status::text = 'active';
  end if;
  return new;
end;
$$;

revoke all on function public.notify_critical_lab_result() from public, anon, authenticated;
drop trigger if exists notify_critical_lab_result on public.lab_orders;
create trigger notify_critical_lab_result
  after insert or update on public.lab_orders
  for each row execute function public.notify_critical_lab_result();

commit;
notify pgrst, 'reload schema';
