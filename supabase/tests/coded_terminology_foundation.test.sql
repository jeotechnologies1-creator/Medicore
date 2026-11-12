begin;
select plan(9);

select is((select count(*)::integer from public.code_systems where code in ('ICD-10','SNOMED CT','LOINC','ATC')),4,'only the four requested code-system identifiers are registered');
select is((select count(*)::integer from public.concepts),0,'migration does not bundle or invent terminology concepts');
select ok((select relrowsecurity from pg_class where oid='public.code_systems'::regclass),'code system registry is protected by RLS');
select ok((select relrowsecurity from pg_class where oid='public.concepts'::regclass),'concept lookup table is protected by RLS');
select ok(has_function_privilege('authenticated','public.request_inpatient_admission_coded(uuid,uuid,uuid,uuid,text,text,text,text,text,text)','execute'),'the coded admission RPC is callable by authenticated clinicians');
select ok(not exists(
  select 1 from (values
    ('consultations'),('prescriptions'),('admissions'),('surgeries'),('patient_allergies'),
    ('patient_conditions'),('lab_orders'),('radiology_orders')
  ) as required_tables(table_name)
  cross join (values('code_system'),('code'),('display')) as required_columns(column_name)
  where not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=required_tables.table_name and c.column_name=required_columns.column_name)
),'all coded clinical fields exist alongside their free-text values');
select ok(not exists(
  select 1 from (values('consultations'),('prescriptions'),('admissions'),('surgeries'),('patient_allergies'),('patient_conditions'),('lab_orders'),('radiology_orders')) as coded_tables(table_name)
  where not exists(select 1 from pg_constraint c where c.conrelid=format('public.%I',coded_tables.table_name)::regclass and c.conname=coded_tables.table_name||'_terminology_concept_fkey' and c.contype='f')
),'new coded clinical values must reference a loaded concept');
select ok(to_regclass('public.uncoded_terminology_entries') is not null,'uncoded entry report view exists');

insert into public.patients(id,first_name,last_name)
values('38000000-0000-4000-8000-000000000001','Terminology','Fixture');
insert into public.consultations(id,patient_id,diagnosis)
values('38000000-0000-4000-8000-000000000002','38000000-0000-4000-8000-000000000001','Synthetic uncoded diagnosis');
select is((select count(*)::integer from public.uncoded_terminology_entries where source_id='38000000-0000-4000-8000-000000000002'),1,'report includes a free-text diagnosis without a selected concept');

select * from finish();
rollback;
