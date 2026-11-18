begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Registration values are audit-relevant lot data. Refuse rollback rather than
-- silently discarding entered values; export/reconcile them before manual removal.
do $$ begin
  if exists(select 1 from public.pharmacy_inventory where nafdac_registration_number is not null) then
    raise exception 'Rollback refused: pharmacy NAFDAC registration values exist; preserve them and fix forward.';
  end if;
end $$;

drop index if exists public.pharmacy_inventory_nafdac_registration_idx;
alter table public.pharmacy_inventory
  drop constraint if exists pharmacy_inventory_nafdac_registration_number_check;
alter table public.pharmacy_inventory
  drop column if exists nafdac_registration_number;

notify pgrst,'reload schema';
commit;
