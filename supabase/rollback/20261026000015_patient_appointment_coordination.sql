-- No automatic rollback is safe for 20261026000015_patient_appointment_coordination.sql.
-- Preserve accumulated clinical and financial data; disable the dependent
-- application workflow and fix forward or restore a reviewed staging backup.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused for 20261026000015_patient_appointment_coordination.sql: preserve deployed data and fix forward.';
end $$;
commit;
