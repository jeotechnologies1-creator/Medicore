begin;
select plan(7);

select has_column('public','medication_orders','formulary_item_id','patient medication orders can reference a selected formulary item');
select has_column('public','medication_administrations','formulary_item_id','administration records preserve formulary identity');
select has_column('public','medication_administrations','prescription_item_id','administrations can only select a structured prescribed item');
select has_column('public','medication_refill_requests','formulary_item_id','patient refill requests retain formulary identity');
select has_column('public','medication_refill_requests','prescription_item_id','patient refill requests link to a prescribed item');
select ok(exists(select 1 from pg_constraint where conrelid='public.medication_administrations'::regclass and conname='medication_administrations_prescription_item_id_fkey'), 'prescription item references are enforced by a foreign key');
select ok(exists(select 1 from pg_constraint where conrelid='public.medication_refill_requests'::regclass and conname='medication_refill_requests_prescription_item_id_fkey'), 'refills cannot refer to nonexistent prescribed items');

select * from finish();
rollback;
