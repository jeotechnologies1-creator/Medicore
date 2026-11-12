begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Preserve clinical records through the authenticated Data API. Corrections
-- should be documented as amendments or status changes, not hard deletes.
-- Privileged server-side retention workflows may use the service role after
-- applying the required privacy, audit, and legal-hold controls.
do $$
declare table_name text;
begin
  -- Fail quickly rather than queueing behind a long transaction and delaying
  -- live clinical traffic. The entire policy replacement is one atomic block.
  perform set_config('lock_timeout', '2s', true);
  perform set_config('statement_timeout', '30s', true);

  foreach table_name in array array[
    'encounters','lab_orders','radiology_orders','prescriptions','vital_signs','consultations',
    'patient_documents','immunizations','medication_administrations','patient_allergies',
    'patient_conditions','medication_orders','care_plans','care_plan_goals','clinical_tasks',
    'patient_consents','clinical_alerts','encounter_workflow_events','result_acknowledgements',
    'medication_reconciliations','admissions','surgeries'
  ] loop
    if to_regclass(format('public.%I', table_name)) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'department clinical delete', table_name);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (false)',
      'department clinical delete', table_name
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
