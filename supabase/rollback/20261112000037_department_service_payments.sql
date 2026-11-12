-- The helper may have been deployed by an older unversioned SQL path. Removing
-- it during rollback could break patient payment instructions, so fix forward.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused: payment-account helper may be in use. Fix forward.';
end $$;
commit;
