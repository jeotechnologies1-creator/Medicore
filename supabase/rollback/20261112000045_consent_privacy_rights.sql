-- Rollback plan for 20261112000045:
-- Consent history, rights requests, disclosures, retention approvals, legal
-- holds, and breach records are accountability records. Preserve the data and
-- fix forward. Do not delete clinical records or consent history on rollback.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused for 20261112000045: preserve consent, disclosure, privacy request, retention, legal-hold, and breach evidence; fix forward.';
end $$;
commit;
