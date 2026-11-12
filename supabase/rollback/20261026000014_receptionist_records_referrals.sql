-- No automatic rollback is safe for 20261026000014_receptionist_records_referrals.sql.
-- Preserve accumulated clinical and financial data; disable the dependent
-- application workflow and fix forward or restore a reviewed staging backup.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused for 20261026000014_receptionist_records_referrals.sql: preserve deployed data and fix forward.';
end $$;
commit;
