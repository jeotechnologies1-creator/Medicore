-- Rollback plan for 20261112000034:
-- Financial rows backfilled from verified patient facility IDs and any new
-- rows created after deployment depend on these ownership columns and RLS
-- policies. Dropping them would expose cross-facility financial data. Preserve
-- the controls and fix forward; an emergency rollback must first disable
-- financial writes, export row ownership, and use a separately reviewed
-- migration that retains facility checks.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused: removing financial facility ownership would expose cross-facility billing and payment data. Fix forward.';
end $$;
commit;
