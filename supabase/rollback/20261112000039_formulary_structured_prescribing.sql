-- Formulary entries, structured prescription records, legacy mapping reports,
-- lot links, and controlled-drug custody records may be in active use. Removing
-- them can orphan medication orders or erase custody history. Fix forward.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused for 20261112000039: preserve structured prescriptions, formulary and controlled-drug audit data; fix forward.';
end $$;
commit;
