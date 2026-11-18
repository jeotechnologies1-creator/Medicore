begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- PostgreSQL default ACLs are creator-role specific. Keep future public-schema
-- functions private from PUBLIC and anon for the migration executor and the
-- standard Supabase postgres owner. Existing grants are not changed here;
-- migration 80's literal SECURITY DEFINER allowlist continues to govern them.
do $$
declare migration_owner name:=current_user;
begin
 execute format('alter default privileges for role %I in schema public revoke execute on functions from public, anon',migration_owner);
 if migration_owner <> 'postgres' then
  alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
 end if;
end $$;

notify pgrst,'reload schema';
commit;
