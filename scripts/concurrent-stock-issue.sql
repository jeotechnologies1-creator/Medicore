-- pgbench transaction script for a disposable, pre-seeded test database.
-- Run two clients simultaneously against a stock lot with a balance smaller
-- than the combined requested quantity. Exactly one issue may succeed; the
-- other must fail with insufficient stock, and the final balance stays >= 0.
-- Required pgbench variables: auth_user_id, lot_id, location_id, issue_quantity.
select set_config('request.jwt.claim.sub', :'auth_user_id', false);
select public.record_store_stock_movement(
  :'lot_id'::uuid,'issue',:'issue_quantity'::numeric,'out',:'location_id'::uuid,null,
  'Concurrent stock issue test',null
);
