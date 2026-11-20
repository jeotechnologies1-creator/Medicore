begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Pharmacy subscribes to new prescriptions and then fetches the order through
-- the existing row-level security policies to build a facility-scoped alert.
-- Only add the table when Supabase Realtime is installed and it is not already
-- part of the publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='prescriptions'
     ) then
    alter publication supabase_realtime add table public.prescriptions;
  end if;
end $$;

commit;
