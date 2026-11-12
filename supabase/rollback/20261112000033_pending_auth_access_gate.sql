-- Rollback plan for 20261112000033:
-- No automatic downgrade is safe. Restoring the former trigger would give a
-- fresh Auth identity active receptionist access; removing restrictive RLS
-- gates would reopen data access. Keep the gate in place and fix forward.
-- For emergency recovery, disable sign-in in the hosted Auth dashboard, keep
-- this migration active, and prepare a separately reviewed forward correction.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused: this security migration has no automatic downgrade. Preserve the access gate and deploy a reviewed forward fix.';
end $$;
commit;
