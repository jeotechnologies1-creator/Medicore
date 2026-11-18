begin;
select plan(3);

select ok((select qual like '%staff_organization_memberships%' from pg_policies where schemaname='public' and tablename='retention_schedule' and policyname='retention_schedule_records_read'),'Super Admin schedule reads require explicit facility assignment');
select ok((select qual like '%staff_organization_memberships%' from pg_policies where schemaname='public' and tablename='legal_holds' and policyname='legal_holds_records_read'),'Super Admin legal-hold reads require explicit facility assignment');
select ok((select qual like '%staff_organization_memberships%' from pg_policies where schemaname='public' and tablename='retention_action_requests' and policyname='retention_action_records_read'),'Super Admin retention-action reads require explicit facility assignment');

select * from finish();
rollback;
