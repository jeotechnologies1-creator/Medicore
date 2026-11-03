-- Roll back 20261103000026_clinical_record_retention.sql.
-- Restores the department-scoped DELETE policies from clinical_department_rls.sql.
-- This does not alter or restore row data.
do $$
declare
  resource record;
  row_patient text;
begin
  perform set_config('lock_timeout', '2s', true);
  perform set_config('statement_timeout', '30s', true);

  for resource in select * from (values
    ('encounters','encounter.create|encounter.update'),
    ('lab_orders','result.enter|order.create'),
    ('radiology_orders','result.enter|order.create'),
    ('prescriptions','medication.prescribe'),
    ('vital_signs','observation.record'),
    ('consultations','encounter.update'),
    ('patient_documents','document.manage'),
    ('immunizations','observation.record'),
    ('medication_administrations','medication.administer'),
    ('patient_allergies','allergy.manage'),
    ('patient_conditions','condition.manage'),
    ('medication_orders','medication.prescribe'),
    ('care_plans','careplan.manage'),
    ('care_plan_goals','careplan.manage'),
    ('clinical_tasks','task.manage'),
    ('patient_consents','consent.manage'),
    ('clinical_alerts','clinical_alert.manage'),
    ('encounter_workflow_events','clinical.workflow'),
    ('result_acknowledgements','result.acknowledge'),
    ('medication_reconciliations','medication.reconcile'),
    ('admissions','admission.manage'),
    ('surgeries','surgery.manage')
  ) as resources(table_name, write_permission)
  loop
    if to_regclass(format('public.%I', resource.table_name)) is null then continue; end if;
    row_patient := format('public.clinical_row_patient_id(%L,to_jsonb(%I))', resource.table_name, resource.table_name);
    execute format('drop policy if exists %I on public.%I', 'department clinical delete', resource.table_name);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.has_clinical_department_permission(%s,nullif(to_jsonb(%I)->>''department'',''''),%L,false))',
      'department clinical delete', resource.table_name, row_patient, resource.table_name, resource.write_permission
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
