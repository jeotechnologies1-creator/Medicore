-- Approved medication safety rules and overrides may be in active clinical use.
-- Removing them could bypass allergy, interaction, dose, and custody controls.
-- Preserve the protections and fix forward; rollback needs a separately reviewed
-- replacement that retains every active safety check and audit record.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused for 20261112000041: preserve medication safety checks, approved rules, and override audit data; fix forward.';
end $$;
commit;
