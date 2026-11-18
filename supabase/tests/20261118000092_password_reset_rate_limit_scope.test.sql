begin;
select plan(1);

select ok(
  position('admin-password-reset' in pg_get_functiondef('public.consume_edge_rate_limit(text,text,text,integer,integer)'::regprocedure)) > 0,
  'password reset requests use an allowed dedicated rate-limit scope'
);

select * from finish();
rollback;
