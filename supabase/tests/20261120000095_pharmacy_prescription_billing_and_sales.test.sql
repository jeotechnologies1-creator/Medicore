begin;
select plan(5);

select has_column('public','billing','prescription_id',
  'pharmacy invoices are linked to their source prescription');
select has_table('public','pharmacy_invoice_lines',
  'pharmacy invoices preserve immutable medicine-level price snapshots');
select ok(exists(select 1 from pg_trigger where tgrelid='public.prescriptions'::regclass
  and tgname='prescriptions_require_paid_pharmacy_invoice' and not tgisinternal),
  'prescriptions cannot transition to dispensed before a paid invoice');
select ok((select prosecdef from pg_proc where oid='public.get_pharmacy_sales(uuid)'::regprocedure),
  'sales reporting is a read-only scoped server function');
select ok(has_function_privilege('authenticated','public.create_pharmacy_prescription_invoice(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.create_pharmacy_prescription_invoice(uuid)','EXECUTE'),
  'only authenticated users can call the guarded pharmacy invoice workflow');

select * from finish();
rollback;
