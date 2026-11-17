begin;
select plan(3);

select ok((select prosecdef from pg_proc where oid='public.receive_purchase_order(uuid,jsonb,text)'::regprocedure),
 'goods receipt runs through the protected procurement workflow');
select ok(pg_get_functiondef('public.receive_purchase_order(uuid,jsonb,text)'::regprocedure) like '%app.purchase_order_stock_writer%',
 'approved order receipt uses the scoped procurement movement context');
select ok(pg_get_functiondef('public.record_store_item_movement(uuid,text,numeric,text,uuid,uuid,text,text)'::regprocedure) like '%app.purchase_order_stock_writer%',
 'direct movements still require stock permission outside the receipt context');

select * from finish();
rollback;
