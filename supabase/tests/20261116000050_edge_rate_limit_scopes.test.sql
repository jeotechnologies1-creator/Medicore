begin;
select plan(8);

select has_function('public','consume_edge_rate_limit',array['text','text','text','integer','integer'],'edge rate-limit RPC exists');
select ok(has_function_privilege('service_role','public.consume_edge_rate_limit(text,text,text,integer,integer)','EXECUTE'),'service role can consume rate limits');
select ok(not has_function_privilege('authenticated','public.consume_edge_rate_limit(text,text,text,integer,integer)','EXECUTE'),'authenticated callers cannot consume internal edge limits');
select ok(not has_function_privilege('anon','public.consume_edge_rate_limit(text,text,text,integer,integer)','EXECUTE'),'anonymous callers cannot consume internal edge limits');

select ok(public.consume_edge_rate_limit('monitoring-health',repeat('b',64),repeat('a',64),1,60),'first request is allowed');
select ok(not public.consume_edge_rate_limit('monitoring-health',repeat('b',64),repeat('a',64),1,60),'request exceeding the configured maximum is denied');
select is((select count(*)::integer from public.edge_rate_limits where scope='monitoring-health' and key_hash in (repeat('a',64),repeat('b',64))),2,'independent user and IP dimensions are recorded');
select throws_ok($$select public.consume_edge_rate_limit('unsupported-scope',null,repeat('c',64),2,60)$$,'22023',null,'unsupported rate-limit scopes are rejected');
select * from finish();
rollback;
