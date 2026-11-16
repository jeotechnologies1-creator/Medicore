begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Restores the former PUBLIC API behavior for all definer functions. This is
-- intended only to reverse migration 80; it also restores the original risk.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.prosecdef
  loop
    execute format('grant execute on function %s to public', f.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
