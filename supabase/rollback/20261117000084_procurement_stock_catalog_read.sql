begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

delete from public.role_permission_grants where role::text='accountant' and permission_key='stock.read' and scope='facility';

notify pgrst,'reload schema';
commit;
