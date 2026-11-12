begin;
select plan(16);

select has_table('public','formulary_items','official formulary entries are stored independently');
select has_table('public','prescription_items','medication orders have structured rows');
select has_table('public','prescription_item_migration_issues','unmapped legacy rows are reportable');
select has_table('public','controlled_drug_register','controlled stock has a running balance');
select has_table('public','controlled_drug_movements','controlled stock movements are auditable');
select has_table('public','controlled_drug_dispense_approvals','controlled dispensing waits for a separate authenticated verifier');
select has_function('public','create_structured_prescription',array['uuid','uuid','text','text','text','text','uuid','numeric','text','text','text','text','numeric','text','text'],'prescription and item creation is atomic');
select has_function('public','dispense_prescription',array['uuid','jsonb'],'dispensing accepts formulary lot selection');
select has_function('public','migrate_legacy_prescription_items',array[]::text[],'legacy mapping can be retried after official formulary import');
select has_function('public','approve_controlled_drug_dispense',array['uuid'],'controlled medicine verification is a separate authenticated action');
select has_column('public','pharmacy_inventory','formulary_item_id','inventory lot points to its formulary item');
select has_column('public','prescription_items','legacy_item_index','legacy conversion remains idempotent per JSON position');

insert into public.patients(id,first_name,last_name) values
 ('a2000000-0000-4000-8000-000000000001','Synthetic','Formulary Test');
insert into public.prescriptions(id,patient_id,medications,status) values
 ('a3000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',
  '[{"name":"Synthetic Test Medicine","dose":"5","dose_unit":"mg","frequency":"daily","route":"oral","quantity":2},{"name":"Unmapped Synthetic Medicine","dose":"1","frequency":"daily","route":"oral","quantity":1}]','active');
insert into public.formulary_items(id,generic_name,form,strength,unit,route) values
 ('a4000000-0000-4000-8000-000000000001','Synthetic Test Medicine','tablet','5 mg','mg','oral');
select public.migrate_legacy_prescription_items();
select is((select count(*)::integer from public.prescription_items where prescription_id='a3000000-0000-4000-8000-000000000001'),1,'unique exact formulary match converts to a structured medication row');
select is((select count(*)::integer from public.prescription_item_migration_issues where prescription_id='a3000000-0000-4000-8000-000000000001'),1,'unmatched legacy medication is recorded for review');
select is((select jsonb_array_length(medications)::integer from public.prescriptions where id='a3000000-0000-4000-8000-000000000001'),2,'original legacy medication JSON is retained unchanged');
select is(public.migrate_legacy_prescription_items()->>'mapped_items','0','rerunning conversion does not duplicate already mapped items');

select * from finish();
rollback;
