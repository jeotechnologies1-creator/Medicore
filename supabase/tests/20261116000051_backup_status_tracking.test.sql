begin;
select plan(6);

select has_table('public','backup_status','backup status singleton exists');
select ok((select relrowsecurity from pg_class where oid='public.backup_status'::regclass),'backup status uses row level security');
select ok(has_table_privilege('service_role','public.backup_status','SELECT') and has_table_privilege('service_role','public.backup_status','UPDATE'),'backup worker can read and update status');
select ok(not has_table_privilege('authenticated','public.backup_status','SELECT') and not has_table_privilege('anon','public.backup_status','SELECT'),'API roles cannot read backup status');
select is((select count(*)::integer from public.backup_status where singleton and last_success_at is null),1,'migration seeds one unreported backup status');

set local role service_role;
update public.backup_status set last_success_at='2026-01-02 03:04:05+00' where singleton;
reset role;
select is((select last_success_at from public.backup_status where singleton),'2026-01-02 03:04:05+00'::timestamptz,'service role can record a successful backup');
select * from finish();
rollback;
