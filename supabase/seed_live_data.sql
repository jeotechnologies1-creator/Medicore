-- Seed real operational data for the live app.
-- Run this after the schema and downstream migrations have executed.
-- First create the required auth users in Supabase Auth using the emails below,
-- then run this script. The profile rows will be linked automatically.

-- 1) Ensure core staff profiles exist and are attached to the correct auth users.
insert into public.profiles (auth_user_id, email, role, full_name, department, status)
select au.id, au.email, 'super_admin', 'System Administrator', 'Administration', 'active'
from auth.users au
where au.email = 'admin@medicore.health'
 on conflict (email) do update
  set role = excluded.role,
      full_name = excluded.full_name,
      department = excluded.department,
      status = excluded.status;

insert into public.profiles (auth_user_id, email, role, full_name, department, status)
select au.id, au.email, 'doctor', 'Dr. Ada Nwosu', 'Internal Medicine', 'active'
from auth.users au
where au.email = 'ada.nwosu@medicore.health'
 on conflict (email) do update
  set role = excluded.role,
      full_name = excluded.full_name,
      department = excluded.department,
      status = excluded.status;

insert into public.profiles (auth_user_id, email, role, full_name, department, status)
select au.id, au.email, 'nurse', 'Grace Okafor', 'Emergency', 'active'
from auth.users au
where au.email = 'grace.okafor@medicore.health'
 on conflict (email) do update
  set role = excluded.role,
      full_name = excluded.full_name,
      department = excluded.department,
      status = excluded.status;

insert into public.profiles (auth_user_id, email, role, full_name, department, status)
select au.id, au.email, 'pharmacist', 'Ifeanyi Martins', 'Pharmacy', 'active'
from auth.users au
where au.email = 'ifeanyi.martins@medicore.health'
 on conflict (email) do update
  set role = excluded.role,
      full_name = excluded.full_name,
      department = excluded.department,
      status = excluded.status;

insert into public.profiles (auth_user_id, email, role, full_name, department, status)
select au.id, au.email, 'receptionist', 'Sarah Ibrahim', 'Front Desk', 'active'
from auth.users au
where au.email = 'sarah.ibrahim@medicore.health'
 on conflict (email) do update
  set role = excluded.role,
      full_name = excluded.full_name,
      department = excluded.department,
      status = excluded.status;

-- 2) Seed patients.
insert into public.patients (
  patient_number, first_name, last_name, date_of_birth, gender, phone, email, address,
  blood_group, emergency_contact_name, emergency_contact_phone, insurance_provider,
  insurance_policy_number, status, allergies, chronic_conditions, registration_date
)
values
  (
    'P-2026-1001', 'Chiamaka', 'Adebayo', '1990-06-12', 'Female', '+2348001110001', 'chiamaka.adebayo@example.com',
    '12 Lekki Phase 1, Lagos', 'O+', 'Emmanuel Adebayo', '+2348001110002', 'Leadway Health',
    'LH-90012', 'active', 'Penicillin', 'None', current_date
  ),
  (
    'P-2026-1002', 'Tunde', 'Eze', '1987-11-03', 'Male', '+2348002220002', 'tunde.eze@example.com',
    '46 Wuse Zone 5, Abuja', 'A+', 'Mariam Eze', '+2348002220003', 'AXA Mansard',
    'AM-77041', 'active', 'None', 'Hypertension', current_date
  ),
  (
    'P-2026-1003', 'Zainab', 'Aliyu', '2001-04-27', 'Female', '+2348003330003', 'zainab.aliyu@example.com',
    '9 GRA, Kano', 'B-', 'Haruna Aliyu', '+2348003330004', 'Access Health',
    'AH-55106', 'active', 'Sulfa drugs', 'Asthma', current_date
  )
 on conflict (patient_number) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      date_of_birth = excluded.date_of_birth,
      gender = excluded.gender,
      phone = excluded.phone,
      email = excluded.email,
      address = excluded.address,
      blood_group = excluded.blood_group,
      emergency_contact_name = excluded.emergency_contact_name,
      emergency_contact_phone = excluded.emergency_contact_phone,
      insurance_provider = excluded.insurance_provider,
      insurance_policy_number = excluded.insurance_policy_number,
      status = excluded.status,
      allergies = excluded.allergies,
      chronic_conditions = excluded.chronic_conditions;

-- 3) Seed appointments.
with patient_map as (
  select id as patient_id, patient_number from public.patients
)
insert into public.appointments (patient_id, doctor_id, appointment_date, appointment_time, appointment_type, department, status, notes)
select pm.patient_id,
       (select id from public.profiles where role = 'doctor' order by created_at limit 1),
       current_date + interval '1 day',
       '09:30',
       'Consultation',
       'Internal Medicine',
       'scheduled',
       'General follow-up review'
from patient_map pm
where pm.patient_number = 'P-2026-1001'
union all
select pm.patient_id,
       (select id from public.profiles where role = 'doctor' order by created_at limit 1),
       current_date + interval '2 days',
       '14:00',
       'Follow-up',
       'Cardiology',
       'scheduled',
       'Blood pressure follow-up'
from patient_map pm
where pm.patient_number = 'P-2026-1002'
union all
select pm.patient_id,
       (select id from public.profiles where role = 'doctor' order by created_at limit 1),
       current_date + interval '3 days',
       '11:15',
       'Consultation',
       'Pulmonology',
       'scheduled',
       'Asthma management review'
from patient_map pm
where pm.patient_number = 'P-2026-1003';

-- 4) Seed lab and imaging orders.
with patient_map as (
  select id as patient_id, patient_number from public.patients
)
insert into public.lab_orders (patient_id, doctor_id, test_type, category, priority, status, ordered_date, result_date, results)
select pm.patient_id,
       (select id from public.profiles where role = 'doctor' limit 1),
       'Complete blood count',
       'Hematology',
       'routine',
       'pending',
       current_date,
       cast(null as date),
       jsonb_build_object('pending', true)
from patient_map pm
where pm.patient_number = 'P-2026-1001'
union all
select pm.patient_id,
       (select id from public.profiles where role = 'doctor' limit 1),
       'Lipid profile',
       'Chemistry',
       'routine',
       'processing',
       current_date,
       cast(null as date),
       jsonb_build_object('status', 'in_progress')
from patient_map pm
where pm.patient_number = 'P-2026-1002';

with patient_map as (
  select id as patient_id, patient_number from public.patients
)
insert into public.radiology_orders (patient_id, doctor_id, study_type, modality, status, priority, ordered_date, scheduled_date, report)
select pm.patient_id,
       (select id from public.profiles where role = 'doctor' limit 1),
       'Chest X-Ray',
       'X-Ray',
       'requested',
       'routine',
       current_date,
       current_date + interval '1 day',
       cast(null as text)
from patient_map pm
where pm.patient_number = 'P-2026-1003';

-- 5) Prescriptions and pharmacy inventory.
with patient_map as (
  select id as patient_id, patient_number from public.patients
)
insert into public.prescriptions (patient_id, doctor_id, diagnosis, medications, status, prescription_date, notes)
select pm.patient_id,
       (select id from public.profiles where role = 'doctor' limit 1),
       'Hypertension review',
       jsonb_build_array(
         jsonb_build_object('name', 'Amlodipine', 'dose', '5mg', 'frequency', 'OD')
       ),
       'active',
       current_date,
       'Continue monitoring blood pressure at home.'
from patient_map pm
where pm.patient_number = 'P-2026-1002'
union all
select pm.patient_id,
       (select id from public.profiles where role = 'doctor' limit 1),
       'Asthma management',
       jsonb_build_array(
         jsonb_build_object('name', 'Salbutamol inhaler', 'dose', '2 puffs', 'frequency', 'PRN')
       ),
       'active',
       current_date,
       'Use as needed for wheezing.'
from patient_map pm
where pm.patient_number = 'P-2026-1003';

insert into public.pharmacy_inventory (name, generic_name, category, stock_quantity, reorder_level, unit_price, expiry_date, batch_number, supplier, location, status)
values
  ('Amlodipine 5mg', 'Amlodipine', 'Cardiology', 120, 30, 250.00, '2027-10-15', 'AML-104', 'Medix Supply', 'Pharmacy A', 'active'),
  ('Salbutamol Inhaler', 'Albuterol', 'Respiratory', 80, 20, 480.00, '2028-02-10', 'SAL-221', 'CareLink Pharma', 'Pharmacy B', 'active'),
  ('Paracetamol 500mg', 'Acetaminophen', 'Analgesic', 200, 40, 110.00, '2027-08-21', 'PCM-301', 'Medix Supply', 'Pharmacy A', 'active');

-- 6) Billing, admissions, and surgery.
with patient_map as (
  select id as patient_id, patient_number from public.patients
)
insert into public.billing (patient_id, invoice_number, invoice_date, subtotal, discount, tax, total, paid, balance, payment_method, status)
select pm.patient_id,
       'INV-' || to_char(current_date, 'YYYYMMDD') || '-' || right(pm.patient_number, 4),
       current_date,
       185000.00,
       15000.00,
       9000.00,
       182000.00,
       120000.00,
       62000.00,
       'Wallet',
       'partial'
from patient_map pm
where pm.patient_number = 'P-2026-1001';

with patient_map as (
  select id as patient_id, patient_number from public.patients
)
insert into public.admissions (patient_id, ward, bed_number, admission_date, diagnosis, status, acuity)
select pm.patient_id,
       'General Ward',
       'A-12',
       current_date,
       'Monitoring for observation',
       'active',
       'stable'
from patient_map pm
where pm.patient_number = 'P-2026-1001';

with patient_map as (
  select id as patient_id, patient_number from public.patients
)
insert into public.surgeries (patient_id, surgeon_id, procedure, scheduled_date, scheduled_time, duration, status, ot_room, anesthesia, priority)
select pm.patient_id,
       (select id from public.profiles where role = 'doctor' limit 1),
       'Laparoscopic appendectomy',
       current_date + interval '5 days',
       '08:30',
       '45 mins',
       'scheduled',
       'OT-3',
       'General',
       'elective'
from patient_map pm
where pm.patient_number = 'P-2026-1003';

-- 7) System settings and audit baseline.
insert into public.system_settings (setting_key, setting_value)
values (
  'hospital_core_settings',
  jsonb_build_object(
    'facilityName', 'MediCore Hospital',
    'country', 'Nigeria',
    'timezone', 'Africa/Lagos',
    'currency', 'NGN',
    'theme', 'dark',
    'roleMatrix', jsonb_build_array(
      jsonb_build_object('role', 'Super Admin', 'permissions', jsonb_build_object('dashboard', true, 'patients', true, 'appointments', true, 'doctors', true, 'laboratory', true, 'radiology', true, 'pharmacy', true, 'billing', true, 'admissions', true, 'surgeries', true, 'clinical_safety', true, 'inventory', true, 'hr', true, 'offices', true, 'reports', true, 'audit', true, 'settings', true)),
      jsonb_build_object('role', 'Doctor', 'permissions', jsonb_build_object('dashboard', true, 'patients', true, 'appointments', true, 'laboratory', true, 'radiology', true, 'pharmacy', false, 'billing', false, 'admissions', true, 'surgeries', false, 'clinical_safety', true)),
      jsonb_build_object('role', 'Nurse', 'permissions', jsonb_build_object('dashboard', true, 'patients', true, 'appointments', false, 'admissions', true, 'clinical_safety', true, 'vitals', true)),
      jsonb_build_object('role', 'Receptionist', 'permissions', jsonb_build_object('dashboard', true, 'patients', true, 'appointments', true, 'billing', true))
    )
  )
)
on conflict (setting_key) do update
  set setting_value = excluded.setting_value,
      updated_at = now();

insert into public.audit_logs (user_id, action, entity_type, entity_id, severity)
select id, 'system_seed', 'system_bootstrap', 'seed_live_data', 'info'
from public.profiles
where role = 'super_admin'
limit 1;

-- 8) Create a first medical office and attach staff.
insert into public.medical_offices (name, office_type, specialty, location, phone, email, status, head_doctor_id, created_by)
select 'MediCore Ambulatory Clinic', 'Clinic', 'General Medicine', 'Victoria Island, Lagos', '+2348005001100', 'clinic@medicore.health', 'active',
       (select id from public.profiles where role = 'doctor' limit 1),
       (select id from public.profiles where role = 'super_admin' limit 1)
where exists (select 1 from public.profiles where role = 'super_admin')
on conflict do nothing;

insert into public.office_staff (office_id, profile_id, role, is_lead)
select mo.id, p.id, 'Lead Physician', true
from public.medical_offices mo
join public.profiles p on p.role = 'doctor'
where mo.name = 'MediCore Ambulatory Clinic'
limit 1
on conflict (office_id, profile_id) do nothing;

-- 9) A few patient-visible notes to make the portal and messages module look real.
-- This is intentionally minimal so the app shows meaningful live data without overloading the database.
insert into public.notifications (user_id, type, title, message, read, priority)
select id, 'system', 'Welcome to MediCore', 'Your patient portal is active and ready for appointments and messages.', false, 'medium'
from public.profiles where role = 'super_admin'
limit 1;
