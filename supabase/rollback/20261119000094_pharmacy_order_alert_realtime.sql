begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Remove the prescriptions table from Realtime when rolling this feature back.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='prescriptions'
     ) then
    alter publication supabase_realtime drop table public.prescriptions;
  end if;
end $$;

commit;
