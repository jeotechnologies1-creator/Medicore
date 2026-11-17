begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Procurement staff need the stock-item catalog to prepare purchase orders.
-- This grant is read-only; stock movement authority remains with pharmacists.
insert into public.role_permission_grants(role,permission_key,scope)
values('accountant','stock.read','facility')
on conflict do nothing;

notify pgrst,'reload schema';
commit;
