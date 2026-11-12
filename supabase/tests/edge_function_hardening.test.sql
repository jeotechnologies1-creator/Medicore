begin;
select plan(12);

select ok(to_regclass('public.edge_rate_limits') is not null,'edge rate limit storage exists');
select ok(not has_table_privilege('authenticated','public.edge_rate_limits','select'),'authenticated users cannot read rate limit keys');
select ok(has_function_privilege('service_role','public.consume_edge_rate_limit(text,text,text,integer,integer)','execute'),'service role can consume edge limits');
select ok(not has_function_privilege('authenticated','public.consume_edge_rate_limit(text,text,text,integer,integer)','execute'),'authenticated users cannot consume edge limits directly');
select ok(public.consume_edge_rate_limit('integration-webhook',null,repeat('a',64),2,60),'first IP request is allowed');
select ok(public.consume_edge_rate_limit('integration-webhook',null,repeat('a',64),2,60),'second IP request is allowed');
select ok(not public.consume_edge_rate_limit('integration-webhook',null,repeat('a',64),2,60),'request beyond IP limit is denied');
select ok(public.consume_edge_rate_limit('create-staff',repeat('b',64),repeat('c',64),1,60),'first per-user request is allowed');
select ok(not public.consume_edge_rate_limit('create-staff',repeat('b',64),repeat('d',64),1,60),'per-user limit is enforced across different IPs');
select throws_ok($$select public.consume_edge_rate_limit('unknown',null,repeat('a',64),2,60)$$,'22023',null,'unknown function scope is rejected');
select lives_ok($$select public.record_account_admin_audit(null,null,'test@example.test','account_created','doctor','failure','{"reason":"synthetic test"}'::jsonb)$$,'audit RPC records account provisioning failures');
select is((select count(*)::integer from public.account_admin_audit where target_email='test@example.test' and outcome='failure'),1,'account audit records target and outcome');

select * from finish();
rollback;
