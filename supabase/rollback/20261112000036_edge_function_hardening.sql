-- Account administration audit history is required to preserve traceability.
-- Disable affected Edge Functions and replace them with separately reviewed
-- guarded implementations before considering any rollback of this migration.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused: removing account audit history and Edge Function rate controls would reduce security and traceability. Fix forward.';
end $$;
commit;
