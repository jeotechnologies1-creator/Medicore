begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Restore PostgreSQL's standard function defaults for these creator roles.
do $$
declare migration_owner name:=current_user;
begin
 execute format('alter default privileges for role %I in schema public grant execute on functions to public, anon',migration_owner);
 if migration_owner <> 'postgres' then
  alter default privileges for role postgres in schema public grant execute on functions to public, anon;
 end if;
end $$;

notify pgrst,'reload schema';
commit;
