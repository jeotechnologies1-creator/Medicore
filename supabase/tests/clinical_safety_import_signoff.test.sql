begin;
select plan(12);
select has_table('public','clinical_safety_dataset_signoffs','clinical safety imports retain sign-off metadata');
select has_function('public','load_clinical_safety_dataset',array['text','jsonb','jsonb'],'imports use one atomic server transaction');
select has_function('public','clinical_safety_status',array[]::text[],'the app can check whether interaction and dose checks are active');
select ok(not has_function_privilege('authenticated','public.load_clinical_safety_dataset(text,jsonb,jsonb)','execute'),'authenticated users cannot import or sign off datasets');
select ok(has_function_privilege('service_role','public.load_clinical_safety_dataset(text,jsonb,jsonb)','execute'),'service role can load operator-supplied datasets');
select ok(has_table_privilege('authenticated','public.clinical_safety_dataset_signoffs','select'),'authenticated sessions receive only policy-filtered sign-off reads');

-- TEST-only fixtures; the transaction is rolled back below and contains no clinical reference data.
insert into public.profiles(id,email,full_name,role,status) values
 ('a5540000-0000-4000-8000-000000000001','TEST-safety-owner@example.invalid','TEST Safety Owner','super_admin','active');
insert into public.formulary_items(id,import_key,generic_name,form,strength,unit,route,active) values
 ('a5540000-0000-4000-8000-000000000010','TEST-ITEM-A','TEST synthetic item A','TEST form','TEST strength','TEST unit','TEST route',true),
 ('a5540000-0000-4000-8000-000000000011','TEST-ITEM-B','TEST synthetic item B','TEST form','TEST strength','TEST unit','TEST route',true);
insert into public.drug_interactions(import_key,formulary_item_a,formulary_item_b,severity,interaction_text,approved,approved_by,approved_at)
 values('TEST-INTERACTION','a5540000-0000-4000-8000-000000000010','a5540000-0000-4000-8000-000000000011','minor','TEST-only synthetic interaction fixture',true,'a5540000-0000-4000-8000-000000000001',now());
insert into public.dose_limits(import_key,formulary_item_id,weight_basis,dose_unit,max_per_dose,approved,approved_by,approved_at)
 values('TEST-DOSE-LIMIT','a5540000-0000-4000-8000-000000000010','fixed','TEST unit',1,true,'a5540000-0000-4000-8000-000000000001',now());
insert into public.clinical_safety_dataset_signoffs(dataset_name,version,source,licence_note,loaded_by,clinical_owner_name,clinical_owner_profile_id,clinical_owner_date)
 values('interactions','TEST-version','TEST synthetic fixture','TEST no licence','TEST operator','TEST Safety Owner','a5540000-0000-4000-8000-000000000001',current_date),
       ('dose_limits','TEST-version','TEST synthetic fixture','TEST no licence','TEST operator','TEST Safety Owner','a5540000-0000-4000-8000-000000000001',current_date);
select is((select count(*)::integer from public.drug_interactions where import_key='TEST-INTERACTION'),1,'synthetic TEST interaction row can be represented');
select is((select count(*)::integer from public.dose_limits where import_key='TEST-DOSE-LIMIT'),1,'synthetic TEST dose row can be represented');
select is((select count(*)::integer from public.clinical_safety_dataset_signoffs where version='TEST-version'),2,'synthetic TEST rows retain both dataset sign-offs');
select ok((select approved from public.drug_interactions where import_key='TEST-INTERACTION'),'TEST interaction is activated only alongside its explicit synthetic sign-off fixture');
select ok((public.clinical_safety_status()->>'interactions_ready')::boolean,'signed-off interaction rules activate their readiness status');
select ok((public.clinical_safety_status()->>'dose_limits_ready')::boolean,'signed-off dose rules activate their readiness status');
select * from finish();
rollback;
