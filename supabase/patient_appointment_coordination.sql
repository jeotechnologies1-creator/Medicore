-- Run after role_authorization.sql and receptionist_records_referrals.sql.
-- Patients request preferred slots; Records assigns an available doctor and confirms the slot.

drop policy if exists "staff manage appointments" on public.appointments;
create policy "clinical staff manage appointments" on public.appointments for all
  using (public.has_any_role(array['super_admin', 'doctor', 'nurse']))
  with check (public.has_any_role(array['super_admin', 'doctor', 'nurse']));

drop policy if exists "records schedule patient requests" on public.appointments;
create policy "records schedule patient requests" on public.appointments for update
  using (public.has_any_role(array['super_admin', 'records_officer']) and status = 'requested')
  with check (public.has_any_role(array['super_admin', 'records_officer']) and status in ('scheduled', 'declined'));

create or replace function public.guard_records_appointment_scheduling() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.has_any_role(array['records_officer']) then
    if old.status <> 'requested'
       or new.status not in ('scheduled', 'declined')
       or new.patient_id is distinct from old.patient_id
       or new.appointment_type is distinct from old.appointment_type
       or new.department is distinct from old.department
       or new.notes is distinct from old.notes
       or new.created_at is distinct from old.created_at then
      raise exception 'Records staff may only confirm or decline an open patient appointment request.';
    end if;
    if new.status = 'scheduled'
       and (new.doctor_id is null or new.appointment_date is null or nullif(trim(new.appointment_time), '') is null) then
      raise exception 'Choose the confirmed doctor, date, and time before scheduling the appointment.';
    end if;
    if new.status = 'scheduled' and not exists (
      select 1 from public.profiles p
      where p.id = new.doctor_id and p.role::text = 'doctor' and p.status::text = 'active'
    ) then
      raise exception 'Only an active doctor can be assigned to the confirmed appointment.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_records_appointment_scheduling on public.appointments;
create trigger guard_records_appointment_scheduling before update on public.appointments
  for each row execute function public.guard_records_appointment_scheduling();

create or replace function public.get_appointment_providers()
returns table(id uuid, full_name text, department text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.department
  from public.profiles p
  where p.role::text = 'doctor' and p.status::text = 'active'
    and public.has_any_role(array['super_admin', 'records_officer'])
  order by p.full_name;
$$;
revoke all on function public.get_appointment_providers() from public;
grant execute on function public.get_appointment_providers() to authenticated;
