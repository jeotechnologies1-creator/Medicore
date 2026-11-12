-- These nullable links may be populated by live medication, administration,
-- or refill records. Removing them discards structured provenance; fix forward.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused for 20261112000040: preserve formulary links on medication and refill records and fix forward.';
end $$;
commit;
