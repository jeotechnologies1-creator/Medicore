-- Catalogue prices and invoice snapshots may be in use and form financial audit history.
-- Preserve that data; rollback requires an approved data-retention plan and fix-forward migration.
begin;
do $$ begin
  raise exception 'Unsafe rollback refused for 20261116000055: price approvals, invoice snapshots, and credit notes are financial records; fix forward after review.';
end $$;
commit;
