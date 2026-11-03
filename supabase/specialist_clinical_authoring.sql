-- Align the table-level author role check with the existing scoped grants for
-- specialists. Department RLS and the clinical workflow guards remain in force.
create or replace function public.can_manage_patient_table(target_table text) returns boolean
language sql stable security definer set search_path = public as $$
  select case target_table
    when 'lab_orders' then public.has_any_role(array['super_admin','doctor','laboratory_scientist'])
    when 'radiology_orders' then public.has_any_role(array['super_admin','doctor','radiographer'])
    when 'prescriptions' then public.has_any_role(array['super_admin','doctor','specialist'])
    when 'vital_signs' then public.has_any_role(array['super_admin','doctor','nurse'])
    when 'consultations' then public.has_any_role(array['super_admin','doctor','nurse','specialist'])
    when 'patient_documents' then public.has_any_role(array['super_admin','doctor','nurse'])
    when 'immunizations' then public.has_any_role(array['super_admin','doctor','nurse'])
    when 'medication_administrations' then public.has_any_role(array['super_admin','doctor','nurse'])
    when 'encounters' then public.has_any_role(array['super_admin','doctor','nurse','specialist'])
    when 'patient_allergies' then public.has_any_role(array['super_admin','doctor','nurse'])
    when 'patient_conditions' then public.has_any_role(array['super_admin','doctor','nurse'])
    when 'medication_orders' then public.has_any_role(array['super_admin','doctor','nurse','specialist'])
    when 'care_plans' then public.has_any_role(array['super_admin','doctor','nurse'])
    when 'clinical_tasks' then public.has_any_role(array['super_admin','doctor','nurse'])
    when 'patient_consents' then public.has_any_role(array['super_admin','doctor','nurse'])
    when 'clinical_alerts' then public.has_any_role(array['super_admin','doctor','nurse'])
    else false
  end;
$$;
