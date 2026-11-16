begin;
do $$ begin
  raise exception 'Unsafe rollback refused for 20261116000076: staged and approved patient imports are retained for audit; use rollback_patient_import_batch for individual batches.';
end $$;
commit;
