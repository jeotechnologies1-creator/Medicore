begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Keep the NAFDAC registration on the received product lot, where it can be
-- traced to the specific batch and supplier. This stores staff-entered data;
-- it does not claim to verify a registration with NAFDAC.
alter table public.pharmacy_inventory
  add column if not exists nafdac_registration_number text;

alter table public.pharmacy_inventory
  drop constraint if exists pharmacy_inventory_nafdac_registration_number_check;
alter table public.pharmacy_inventory
  add constraint pharmacy_inventory_nafdac_registration_number_check
  check (nafdac_registration_number is null or (
    nafdac_registration_number = btrim(nafdac_registration_number)
    and length(nafdac_registration_number) between 3 and 80
    and nafdac_registration_number !~ '[[:cntrl:]]'
  ));

comment on column public.pharmacy_inventory.nafdac_registration_number is
  'Staff-entered NAFDAC registration number as printed on this stock lot; not independently verified.';

create index if not exists pharmacy_inventory_nafdac_registration_idx
  on public.pharmacy_inventory(nafdac_registration_number)
  where nafdac_registration_number is not null;

notify pgrst,'reload schema';
commit;
