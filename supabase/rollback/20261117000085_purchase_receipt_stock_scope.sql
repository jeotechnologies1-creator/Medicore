begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Restore the migration 71 function definitions before this scoped receipt fix.
do $$
begin
 raise exception 'Reviewed rollback required: restore migration 71 stock and procurement RPC definitions while preserving the append-only movement history.';
end $$;
commit;
