-- Vital score values, approved threshold rules, alerts, and escalation tasks
-- are part of the patient's longitudinal record. Removing them could erase
-- evidence used in clinical decisions. Keep the controls and fix forward.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused for 20261112000042: preserve recorded early-warning scores, alert thresholds, and escalation history; fix forward.';
end $$;
commit;
