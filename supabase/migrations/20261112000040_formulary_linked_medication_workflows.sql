begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Keep existing historical records readable; new app records must reference a
-- formulary selection or a structured prescribed item.
alter table public.medication_orders
  add column if not exists formulary_item_id uuid references public.formulary_items(id) on delete restrict;
alter table public.medication_administrations
  add column if not exists formulary_item_id uuid references public.formulary_items(id) on delete restrict,
  add column if not exists prescription_item_id uuid references public.prescription_items(id) on delete restrict;
alter table public.medication_refill_requests
  add column if not exists formulary_item_id uuid references public.formulary_items(id) on delete restrict,
  add column if not exists prescription_item_id uuid references public.prescription_items(id) on delete restrict;
create index if not exists medication_orders_formulary_idx on public.medication_orders(formulary_item_id) where formulary_item_id is not null;
create index if not exists medication_administrations_prescription_item_idx on public.medication_administrations(prescription_item_id) where prescription_item_id is not null;
create index if not exists medication_refill_requests_prescription_item_idx on public.medication_refill_requests(prescription_item_id) where prescription_item_id is not null;

commit;
notify pgrst,'reload schema';
