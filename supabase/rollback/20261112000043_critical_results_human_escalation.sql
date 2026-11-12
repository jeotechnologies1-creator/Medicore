-- Result ranges, acknowledgement records, and outbound attempts are clinical
-- safety evidence. Removing them can hide unacknowledged critical findings.
-- Preserve the workflow and fix forward; rollback requires a reviewed plan.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused for 20261112000043: preserve result classifications, read-back acknowledgements, and escalation history; fix forward.';
end $$;
commit;
