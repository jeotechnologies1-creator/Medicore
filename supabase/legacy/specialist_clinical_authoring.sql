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

drop policy if exists "clinical manage encounters" on public.encounters;
create policy "clinical manage encounters" on public.encounters for all
  using (public.has_any_role(array['super_admin','doctor','nurse','specialist']))
  with check (public.has_any_role(array['super_admin','doctor','nurse','specialist']));

drop policy if exists "HIM register encounters" on public.encounters;
create policy "HIM register encounters" on public.encounters for insert
  with check (
    public.has_any_role(array['super_admin','records_officer','receptionist','doctor','nurse','specialist'])
    and status = 'arrived'
    and ended_at is null
    and ((case_type <> 'bid' and death_assessment_status is null)
      or (case_type = 'bid' and death_assessment_status = 'assessment_required'))
  );

drop policy if exists "staff record encounter workflow" on public.encounter_workflow_events;
create policy "staff record encounter workflow" on public.encounter_workflow_events for insert
  with check (
    public.has_any_role(array['super_admin','records_officer','receptionist','doctor','nurse','specialist'])
    and actor_id = (select id from public.profiles where auth_user_id = auth.uid() limit 1)
    and exists (select 1 from public.encounters e where e.id = encounter_id and e.patient_id = patient_id)
  );

-- Specialists have a department-scoped result.acknowledge grant. Add them to
-- the permissive row policies; clinical_department_rls.sql still restricts
-- each row to the assigned facility and department.
drop policy if exists "clinical manage result acknowledgements" on public.result_acknowledgements;
create policy "clinical manage result acknowledgements" on public.result_acknowledgements for all
  using (public.has_any_role(array['super_admin','doctor','nurse','specialist']))
  with check (public.has_any_role(array['super_admin','doctor','nurse','specialist']));

drop policy if exists "clinical read result acknowledgements" on public.result_acknowledgements;
create policy "clinical read result acknowledgements" on public.result_acknowledgements for select
  using (public.has_any_role(array['super_admin','doctor','nurse','specialist']));
