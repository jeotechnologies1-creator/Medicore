begin;
select plan(3);

select has_column('public','pharmacy_inventory','nafdac_registration_number',
  'received pharmacy lots can record their NAFDAC registration number');
select has_index('public','pharmacy_inventory','pharmacy_inventory_nafdac_registration_idx',
  'registration-number lookups have an index');
select col_type_is('public','pharmacy_inventory','nafdac_registration_number','text',
  'registration number is stored as text to preserve its printed format');

select * from finish();
rollback;
