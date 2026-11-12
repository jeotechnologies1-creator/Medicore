begin;
select plan(19);

select has_table('public','allergen_classes','coded allergen classes can be loaded from approved terminology');
select has_table('public','formulary_allergen_map','formulary items can be linked to exact coded allergens or classes');
select has_table('public','drug_interactions','drug interactions are stored as reviewed formulary pairs');
select has_table('public','dose_limits','approved age, weight, dose, renal and pregnancy rules can be stored');
select has_table('public','medication_safety_overrides','prescriber overrides have an auditable record');
select has_table('public','patient_medication_risk_flags','pregnancy and renal risk data can be recorded');
select has_function('public','check_prescription',array['uuid','jsonb'],'the server returns medication safety findings');
select has_function('public','request_medication_safety_override',array['uuid','jsonb','text[]','text'],'prescribers can request a reasoned override');
select has_function('public','approve_medication_safety_override',array['uuid'],'a different clinician can approve severe overrides');
select ok(exists(select 1 from pg_trigger where tgrelid='public.prescription_items'::regclass and tgname='enforce_prescription_item_safety' and not tgisinternal),'structured prescription writes run server checks');
select ok(exists(select 1 from pg_trigger where tgrelid='public.medication_orders'::regclass and tgname='enforce_medication_order_safety' and not tgisinternal),'legacy medication order writes run server checks');
select ok((select count(*)=0 from public.allergen_classes),'allergen classes ship empty pending approved source data');
select ok((select count(*)=0 from public.formulary_allergen_map),'allergen mappings ship empty pending approved source data');
select ok((select count(*)=0 from public.drug_interactions),'interaction rules ship empty pending approved source data');
select ok((select count(*)=0 from public.dose_limits),'dose rules ship empty pending approved source data');
select ok((select relrowsecurity from pg_class where oid='public.drug_interactions'::regclass),'interaction rules are protected by row-level security');
select ok((select relrowsecurity from pg_class where oid='public.dose_limits'::regclass),'dose rules are protected by row-level security');
select ok(exists(select 1 from pg_constraint where conrelid='public.drug_interactions'::regclass and conname='drug_interactions_approval_check'),'approved interactions require an approver and approval time');
select ok(exists(select 1 from pg_constraint where conrelid='public.medication_safety_overrides'::regclass and conname='medication_safety_overrides_second_approver_check'),'severe override records require a distinct second approver');

select * from finish();
rollback;
