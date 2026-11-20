begin;
select plan(1);

select ok(
  not exists (select 1 from pg_publication where pubname='supabase_realtime')
  or exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='prescriptions'
  ),
  'new prescription inserts are available to Supabase Realtime when its publication exists'
);

select * from finish();
rollback;
