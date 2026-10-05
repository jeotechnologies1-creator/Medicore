-- Run after role_authorization.sql and receptionist_records_referrals.sql.
-- Patients request preferred slots; Records assigns an available doctor and confirms the slot.

drop policy if exists "staff manage appointments" on public.appointments;
drop policy if exists "clinical staff manage appointments" on public.appointments;
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

-- Associate confirmation notifications with appointments and prevent duplicates.
alter table public.notifications add column if not exists appointment_id uuid references public.appointments(id) on delete set null;
create unique index if not exists notifications_appointment_id_unique
  on public.notifications(appointment_id) where appointment_id is not null;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

create or replace function public.create_appointment_confirmation_notification(
  target_appointment_id uuid,
  target_patient_id uuid,
  target_doctor_id uuid,
  target_date date,
  target_time text,
  target_department text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  recipient_profile_id uuid;
  doctor_name text;
  notification_id uuid;
begin
  select p.id into recipient_profile_id
  from public.profiles p
  where p.patient_id = target_patient_id and p.role::text = 'patient' and p.status::text = 'active'
  limit 1;
  if recipient_profile_id is null then
    raise exception 'This patient has no active portal account to receive the appointment notification.';
  end if;
  select p.full_name into doctor_name
  from public.profiles p
  where p.id = target_doctor_id and p.role::text = 'doctor' and p.status::text = 'active';
  if doctor_name is null then
    raise exception 'The selected doctor is not active.';
  end if;

  insert into public.notifications(user_id, type, title, message, read, priority, appointment_id)
  values (
    recipient_profile_id,
    'appointment_confirmed',
    'Appointment confirmed',
    format('Your %s appointment with Dr. %s is confirmed for %s at %s.', coalesce(nullif(target_department, ''), 'medical'), doctor_name, to_char(target_date, 'FMMonth FMDD, YYYY'), target_time),
    false,
    'high',
    target_appointment_id
  )
  on conflict (appointment_id) where appointment_id is not null do nothing
  returning id into notification_id;
  if notification_id is null then
    select n.id into notification_id from public.notifications n where n.appointment_id = target_appointment_id limit 1;
  end if;
  return notification_id;
end;
$$;
revoke all on function public.create_appointment_confirmation_notification(uuid, uuid, uuid, date, text, text) from public;

create or replace function public.confirm_patient_appointment(
  p_appointment_id uuid,
  p_doctor_id uuid,
  p_appointment_date date,
  p_appointment_time text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  appointment_row public.appointments%rowtype;
  notice_id uuid;
begin
  if not public.has_any_role(array['super_admin', 'records_officer']) then
    raise exception 'Only Records staff can confirm a patient appointment request.';
  end if;
  select * into appointment_row from public.appointments
  where id = p_appointment_id and status = 'requested' for update;
  if not found then raise exception 'This appointment request is no longer open.'; end if;
  if p_appointment_date is null or nullif(trim(p_appointment_time), '') is null then
    raise exception 'A confirmed date and time are required.';
  end if;
  update public.appointments
  set doctor_id = p_doctor_id, appointment_date = p_appointment_date,
      appointment_time = p_appointment_time, status = 'scheduled'
  where id = p_appointment_id returning * into appointment_row;
  notice_id := public.create_appointment_confirmation_notification(
    appointment_row.id, appointment_row.patient_id, appointment_row.doctor_id,
    appointment_row.appointment_date, appointment_row.appointment_time, appointment_row.department
  );
  return jsonb_build_object('appointment', to_jsonb(appointment_row), 'notification_id', notice_id);
end;
$$;
revoke all on function public.confirm_patient_appointment(uuid, uuid, date, text) from public;
grant execute on function public.confirm_patient_appointment(uuid, uuid, date, text) to authenticated;

create or replace function public.book_patient_appointment(
  p_patient_id uuid,
  p_doctor_id uuid,
  p_appointment_date date,
  p_appointment_time text,
  p_department text,
  p_appointment_type text default 'consultation',
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  appointment_row public.appointments%rowtype;
  notice_id uuid;
begin
  if not public.has_any_role(array['super_admin', 'records_officer']) then
    raise exception 'Only Records staff can book appointments on behalf of patients.';
  end if;
  if not exists (select 1 from public.patients p where p.id = p_patient_id) then
    raise exception 'Patient record not found.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_doctor_id and p.role::text = 'doctor' and p.status::text = 'active') then
    raise exception 'Select an active doctor.';
  end if;
  if p_appointment_date is null or nullif(trim(p_appointment_time), '') is null or nullif(trim(p_department), '') is null then
    raise exception 'A department, approved date, and approved time are required.';
  end if;
  insert into public.appointments(patient_id, doctor_id, appointment_date, appointment_time, appointment_type, department, status, notes)
  values (p_patient_id, p_doctor_id, p_appointment_date, p_appointment_time, coalesce(p_appointment_type, 'consultation'), trim(p_department), 'scheduled', p_notes)
  returning * into appointment_row;
  notice_id := public.create_appointment_confirmation_notification(
    appointment_row.id, appointment_row.patient_id, appointment_row.doctor_id,
    appointment_row.appointment_date, appointment_row.appointment_time, appointment_row.department
  );
  return jsonb_build_object('appointment', to_jsonb(appointment_row), 'notification_id', notice_id);
end;
$$;
revoke all on function public.book_patient_appointment(uuid, uuid, date, text, text, text, text) from public;
grant execute on function public.book_patient_appointment(uuid, uuid, date, text, text, text, text) to authenticated;
