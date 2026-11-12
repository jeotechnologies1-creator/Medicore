-- Identity decisions and merge/reversal history are clinical accountability
-- records. Preserve them and fix forward; never erase history to roll back.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused for 20261112000047: preserve patient duplicate reviews, identity decisions, and reversible merge history; fix forward.';
end $$;
commit;
