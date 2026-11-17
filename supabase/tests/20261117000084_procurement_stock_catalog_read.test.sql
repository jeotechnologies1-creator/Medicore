begin;
select plan(2);

select ok(exists(select 1 from public.role_permission_grants where role::text='accountant' and permission_key='stock.read' and scope='facility'),
 'procurement accountants can read the facility stock catalog');
select ok(not exists(select 1 from public.role_permission_grants where role::text='accountant' and permission_key='stock.manage'),
 'procurement catalog access does not grant stock movement authority');

select * from finish();
rollback;
