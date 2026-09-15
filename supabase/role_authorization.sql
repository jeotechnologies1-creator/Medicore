-- Run after app_activation.sql. Replaces broad "any staff member" write access
-- with minimum role-based permissions for the MediCore browser workflows.

create or replace function public.has_any_role(allowed_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select status = 'active' and role = any(allowed_roles)
    from public.profiles where auth_user_id = auth.uid() limit 1
  ), false);
$$;

create or replace function public.can_read_patient_record(target_patient_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_clinical_staff()
    or exists (select 1 from public.profiles where auth_user_id = auth.uid() and patient_id = target_patient_id);
$$;

-- Start from a known policy state. This makes the migration safe to re-run and
-- prevents a permissive policy left by an earlier release from combining with
-- the role-specific policies below (Postgres ORs matching RLS policies).
do $$
declare table_name text; policy_name text;
begin
  foreach table_name in array array[
    'patients','appointments','lab_orders','radiology_orders','prescriptions','pharmacy_inventory','billing',
    'admissions','surgeries','vital_signs','consultations','patient_documents','immunizations',
    'medication_administrations','encounters','patient_allergies','patient_conditions','medication_orders',
    'care_plans','care_plan_goals','clinical_tasks','patient_consents','clinical_alerts','insurance_claims','wards','beds',
    'medical_offices','office_staff','system_settings','compliance_exports','result_acknowledgements','medication_reconciliations'
  ] loop
    for policy_name in
      select policyname from pg_policies where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end $$;

-- Supersede the earlier clinical-safety policies, whose clinical-staff group is
-- intentionally broader than the authors/reviewers allowed below.
drop policy if exists "clinical staff or patient read encounters" on public.encounters;
drop policy if exists "clinical staff manage encounters" on public.encounters;
drop policy if exists "clinical staff or patient read allergies" on public.patient_allergies;
drop policy if exists "clinical staff manage allergies" on public.patient_allergies;
drop policy if exists "clinical staff or patient read conditions" on public.patient_conditions;
drop policy if exists "clinical staff manage conditions" on public.patient_conditions;
drop policy if exists "clinical staff or patient read medication orders" on public.medication_orders;
drop policy if exists "clinical staff manage medication orders" on public.medication_orders;
drop policy if exists "clinical staff or patient read care plans" on public.care_plans;
drop policy if exists "clinical staff manage care plans" on public.care_plans;
drop policy if exists "clinical staff manage care goals" on public.care_plan_goals;
drop policy if exists "clinical staff or patient read tasks" on public.clinical_tasks;
drop policy if exists "clinical staff manage tasks" on public.clinical_tasks;
drop policy if exists "clinical staff or patient read consents" on public.patient_consents;
drop policy if exists "clinical staff manage consents" on public.patient_consents;
drop policy if exists "clinical staff read alerts" on public.clinical_alerts;
drop policy if exists "clinical staff manage alerts" on public.clinical_alerts;
create policy "clinical manage care-plan goals" on public.care_plan_goals for all using (
  public.is_clinical_staff() and exists (select 1 from public.care_plans cp where cp.id = care_plan_goals.care_plan_id)
) with check (public.is_clinical_staff());

drop policy if exists "staff or patient read patients" on public.patients;
create policy "authorized read patients" on public.patients for select using (public.is_staff() or public.can_access_patient(id));
create policy "registration manage patients" on public.patients for insert with check (public.has_any_role(array['super_admin','receptionist','nurse','doctor']));
create policy "clinical update patients" on public.patients for update using (public.has_any_role(array['super_admin','receptionist','nurse','doctor'])) with check (public.has_any_role(array['super_admin','receptionist','nurse','doctor']));
create policy "admins delete patients" on public.patients for delete using (public.is_admin());

drop policy if exists "staff manage appointments" on public.appointments;
drop policy if exists "patients read own appointments" on public.appointments;
drop policy if exists "patients request appointments" on public.appointments;
create policy "authorized read appointments" on public.appointments for select using (public.is_staff() or public.can_access_patient(patient_id));
create policy "staff manage appointments" on public.appointments for all using (public.has_any_role(array['super_admin','receptionist','nurse','doctor'])) with check (public.has_any_role(array['super_admin','receptionist','nurse','doctor']));
create policy "patients request appointments" on public.appointments for insert with check (public.can_access_patient(patient_id) and status = 'requested');

-- Orders, documentation, allergies, care plans, and alerts: clinical staff only.
do $$
declare table_name text;
begin
  foreach table_name in array array['lab_orders','radiology_orders','prescriptions','vital_signs','consultations','patient_documents','immunizations','medication_administrations','encounters','patient_allergies','patient_conditions','medication_orders','care_plans','clinical_tasks','patient_consents','clinical_alerts'] loop
    execute format('create policy %I on public.%I for select using (public.can_read_patient_record(patient_id))', 'authorized clinical read', table_name);
    execute format('create policy %I on public.%I for all using (public.is_clinical_staff()) with check (public.is_clinical_staff())', 'clinical staff manage', table_name);
  end loop;
end $$;

create policy "finance read billing" on public.billing for select using (public.has_any_role(array['super_admin','accountant','receptionist']) or public.can_access_patient(patient_id));
create policy "finance manage billing" on public.billing for all using (public.has_any_role(array['super_admin','accountant','receptionist'])) with check (public.has_any_role(array['super_admin','accountant','receptionist']));
create policy "finance manage insurance" on public.insurance_claims for all using (public.has_any_role(array['super_admin','accountant'])) with check (public.has_any_role(array['super_admin','accountant']));
create policy "authorized read insurance" on public.insurance_claims for select using (public.has_any_role(array['super_admin','accountant','receptionist']) or public.can_access_patient(patient_id));

create policy "pharmacy manage inventory" on public.pharmacy_inventory for all using (public.has_any_role(array['super_admin','pharmacist'])) with check (public.has_any_role(array['super_admin','pharmacist']));
create policy "clinical read inventory" on public.pharmacy_inventory for select using (public.is_clinical_staff());
create policy "clinical manage admissions" on public.admissions for all using (public.has_any_role(array['super_admin','doctor','nurse'])) with check (public.has_any_role(array['super_admin','doctor','nurse']));
create policy "authorized read admissions" on public.admissions for select using (public.can_read_patient_record(patient_id));
create policy "clinical manage surgeries" on public.surgeries for all using (public.has_any_role(array['super_admin','doctor','nurse'])) with check (public.has_any_role(array['super_admin','doctor','nurse']));
create policy "authorized read surgeries" on public.surgeries for select using (public.can_read_patient_record(patient_id));

create policy "clinical manage wards" on public.wards for all using (public.has_any_role(array['super_admin','nurse'])) with check (public.has_any_role(array['super_admin','nurse']));
create policy "staff read wards" on public.wards for select using (public.is_staff());
create policy "clinical manage beds" on public.beds for all using (public.has_any_role(array['super_admin','nurse'])) with check (public.has_any_role(array['super_admin','nurse']));
create policy "staff read beds" on public.beds for select using (public.is_staff());
create policy "admins manage offices" on public.medical_offices for all using (public.is_admin()) with check (public.is_admin());
create policy "staff read offices" on public.medical_offices for select using (public.is_staff());
create policy "admins manage office staff" on public.office_staff for all using (public.is_admin()) with check (public.is_admin());
create policy "staff read office staff" on public.office_staff for select using (public.is_staff());
create policy "admins manage system settings" on public.system_settings for all using (public.is_admin()) with check (public.is_admin());
create policy "staff read system settings" on public.system_settings for select using (public.is_staff());
create policy "admins manage compliance exports" on public.compliance_exports for all using (public.is_admin()) with check (public.is_admin());
create policy "admins read compliance exports" on public.compliance_exports for select using (public.is_admin());

drop policy if exists "clinical staff manage result acknowledgements" on public.result_acknowledgements;
drop policy if exists "clinical staff manage medication reconciliations" on public.medication_reconciliations;
create policy "clinical manage result acknowledgements" on public.result_acknowledgements for all using (public.has_any_role(array['super_admin','doctor','nurse'])) with check (public.has_any_role(array['super_admin','doctor','nurse']));
create policy "clinical manage medication reconciliations" on public.medication_reconciliations for all using (public.has_any_role(array['super_admin','doctor','nurse'])) with check (public.has_any_role(array['super_admin','doctor','nurse']));
create policy "clinical read result acknowledgements" on public.result_acknowledgements for select using (public.is_clinical_staff());
create policy "clinical read medication reconciliations" on public.medication_reconciliations for select using (public.is_clinical_staff());
