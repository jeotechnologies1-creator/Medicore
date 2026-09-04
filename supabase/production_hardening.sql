-- Run after clinical_safety.sql and patient_portal.sql, then test each role before go-live.
-- Replaces the legacy "any authenticated user can do anything" policies.

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role <> 'patient' and status = 'active' from public.profiles where auth_user_id = auth.uid() limit 1), false);
$$;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' and status = 'active' from public.profiles where auth_user_id = auth.uid() limit 1), false);
$$;

-- Operational records are staff-only. Patient-facing records get their own policy below.
do $$
declare table_name text;
begin
  foreach table_name in array array['pharmacy_inventory','medical_offices','office_staff','wards','beds','insurance_claims','surgeries','notifications','system_settings','compliance_exports']
  loop
    execute format('drop policy if exists %I on public.%I', 'Allow all access for authenticated users', table_name);
    execute format('drop policy if exists %I on public.%I', 'Authenticated application access', table_name);
    execute format('drop policy if exists %I on public.%I', 'staff manage records', table_name);
    execute format('create policy %I on public.%I for all using (public.is_staff()) with check (public.is_staff())', 'staff manage records', table_name);
  end loop;
end $$;

-- Patient-owned rows: staff can manage all, patients can read only their own care.
do $$
declare table_name text;
begin
  foreach table_name in array array['lab_orders','radiology_orders','prescriptions','billing','admissions','vital_signs','consultations','patient_documents','immunizations','medication_administrations','encounters','patient_allergies','patient_conditions','medication_orders','care_plans','clinical_tasks','patient_consents','clinical_alerts']
  loop
    execute format('drop policy if exists %I on public.%I', 'Allow all access for authenticated users', table_name);
    execute format('drop policy if exists %I on public.%I', 'Authenticated application access', table_name);
    execute format('drop policy if exists %I on public.%I', 'staff manage records', table_name);
    execute format('drop policy if exists %I on public.%I', 'staff or patient read records', table_name);
    execute format('create policy %I on public.%I for select using (public.is_staff() or public.can_access_patient(patient_id))', 'staff or patient read records', table_name);
    execute format('create policy %I on public.%I for all using (public.is_staff()) with check (public.is_staff())', 'staff manage records', table_name);
  end loop;
end $$;

-- `patients` is itself the patient record, so its ownership column is `id` rather than `patient_id`.
drop policy if exists "Allow all access for authenticated users" on public.patients;
drop policy if exists "Authenticated application access" on public.patients;
drop policy if exists "staff manage records" on public.patients;
drop policy if exists "staff or patient read records" on public.patients;
drop policy if exists "staff or patient read patients" on public.patients;
create policy "staff or patient read patients" on public.patients for select
  using (public.is_staff() or public.can_access_patient(id));
create policy "staff manage records" on public.patients for all
  using (public.is_staff()) with check (public.is_staff());

-- Appointments are the sole patient-writable clinical record: patients can request their own slot only.
drop policy if exists "Allow all access for authenticated users" on public.appointments;
drop policy if exists "Authenticated application access" on public.appointments;
drop policy if exists "staff manage appointments" on public.appointments;
drop policy if exists "patients read own appointments" on public.appointments;
drop policy if exists "patients request appointments" on public.appointments;
create policy "staff manage appointments" on public.appointments for all using (public.is_staff()) with check (public.is_staff());
create policy "patients read own appointments" on public.appointments for select using (public.can_access_patient(patient_id));
create policy "patients request appointments" on public.appointments for insert with check (
  exists (select 1 from public.profiles p where p.auth_user_id = auth.uid() and p.patient_id = appointments.patient_id)
  and status = 'requested'
);

drop policy if exists "Allow all access for authenticated users" on public.profiles;
drop policy if exists "Authenticated application access" on public.profiles;
drop policy if exists "users read own profile" on public.profiles;
drop policy if exists "admins manage profiles" on public.profiles;
create policy "users read own profile" on public.profiles for select using (auth_user_id = auth.uid() or public.is_admin());
create policy "admins manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Allow all access for authenticated users" on public.audit_logs;
drop policy if exists "Authenticated application access" on public.audit_logs;
drop policy if exists "admins read audit logs" on public.audit_logs;
create policy "admins read audit logs" on public.audit_logs for select using (public.is_admin());

-- Server-side audit trail: application users cannot forge or alter audit entries.
create or replace function public.audit_row_change() returns trigger language plpgsql security definer set search_path = public as $$
declare actor_id uuid;
declare entity_uuid uuid;
begin
  select id into actor_id from public.profiles where auth_user_id = auth.uid() limit 1;
  if tg_op = 'DELETE' then entity_uuid := old.id; else entity_uuid := new.id; end if;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, severity)
  values (actor_id, tg_op, tg_table_name, entity_uuid::text, 'info');
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['patients','appointments','lab_orders','radiology_orders','prescriptions','billing','admissions','surgeries','vital_signs','consultations','patient_documents','patient_allergies','patient_conditions','medication_orders','care_plans','patient_messages','medication_refill_requests']
  loop
    execute format('drop trigger if exists audit_%I on public.%I', table_name, table_name);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()', table_name, table_name);
  end loop;
end $$;

-- Private document storage. Object names are generated as <patient UUID>/<random>-<file name>.
insert into storage.buckets (id, name, public) values ('patient-documents', 'patient-documents', false) on conflict (id) do update set public = false;
drop policy if exists "authorized users read patient documents" on storage.objects;
drop policy if exists "clinical staff upload patient documents" on storage.objects;
drop policy if exists "clinical staff delete patient documents" on storage.objects;
create policy "authorized users read patient documents" on storage.objects for select using (
  bucket_id = 'patient-documents' and exists (select 1 from public.patients p where p.id::text = split_part(name, '/', 1) and public.can_access_patient(p.id))
);
create policy "clinical staff upload patient documents" on storage.objects for insert with check (bucket_id = 'patient-documents' and public.is_clinical_staff());
create policy "clinical staff delete patient documents" on storage.objects for delete using (bucket_id = 'patient-documents' and public.is_clinical_staff());
