-- Rollback plan for 20261112000044:
-- Hash-chain fields, audit events, access logs, and break-glass records provide
-- evidence required for privacy and clinical investigations. Preserve them and
-- fix forward. Emergency disablement must be separately reviewed and retain
-- existing audit evidence and patient-scope checks.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused for 20261112000044: preserve tamper-evident audit records, patient read logs, and break-glass history; fix forward.';
end $$;
commit;
