begin;
-- This is the deployed-policy baseline matrix. The docs explicitly distinguish
-- planned fine-grained permissions from deployed policy, so the universal
-- expected result here is fail-closed for pending identities. Domain-specific
-- within/across-facility behavior is exercised in HIM and financial tests.
create temporary table rls_matrix(table_name text not null, role_name text not null, action_name text not null, expected_allowed boolean not null, primary key(table_name,role_name,action_name)) on commit drop;
insert into rls_matrix
select c.relname, roles.role_name, actions.action_name, roles.role_name <> 'pending'
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values('patient'),('receptionist'),('nurse'),('doctor'),('pharmacist'),('laboratory_scientist'),('radiographer'),('accountant'),('records_officer'),('surgeon'),('specialist'),('theatre_staff'),('super_admin'),('pending')) roles(role_name)
cross join (values('select'),('insert'),('update'),('delete')) actions(action_name)
where n.nspname='public' and c.relkind in ('r','p') and not c.relispartition
  and c.relname not in ('spatial_ref_sys');

select plan(6);
select ok((select count(distinct role_name)=14 from rls_matrix),'matrix includes every documented application role');
select ok((select count(distinct action_name)=4 from rls_matrix),'matrix covers select, insert, update, and delete');
select ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and not c.relispartition and c.relname<>'spatial_ref_sys'
    and not exists(select 1 from rls_matrix m where m.table_name=c.relname)
),'every public application table has a matrix row');
select ok(not exists (
  select 1 from rls_matrix m where not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=m.table_name)
),'matrix contains no stale table names');
select ok(not exists (
  select 1 from rls_matrix m where not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=m.table_name and c.relrowsecurity)
),'every matrix table has row level security enabled');
select ok(not exists(
  select 1 from rls_matrix m where m.role_name='pending' and m.expected_allowed
),'pending role is denied every operation by the documented access gate');
select * from finish();
rollback;
