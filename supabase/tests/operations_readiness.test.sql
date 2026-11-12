begin;
select plan(15);

select has_table('public','monitoring_events','allowlisted monitoring events have storage');
select has_table('public','downtime_events','downtime incident register remains available');
select has_function('public','get_downtime_read_only_mode',array[]::text[],'active users can read downtime mode through the RPC');
select has_function('public','set_downtime_read_only_mode',array['boolean'],'only the protected RPC changes downtime mode');
select has_function('public','get_operations_alerts',array[]::text[],'operations alert counters are available');
select has_function('public','list_dormant_staff',array['boolean'],'dormant staff review and optional suspension are available');
select has_trigger('public','patients','reject_downtime_writes','patient mutations have a downtime guard');
select has_trigger('public','system_settings','reject_downtime_writes','ordinary settings changes are blocked during downtime');
select has_trigger('storage','objects','reject_downtime_writes','Storage object writes are blocked during downtime');

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('49000000-0000-4000-8000-000000000001','authenticated','authenticated','ops-readiness@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='super_admin',status='active' where auth_user_id='49000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','49000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"49000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select is(public.get_downtime_read_only_mode(),false,'downtime mode starts disabled');
select lives_ok($$select public.set_downtime_read_only_mode(true)$$,'Super Admin can enable downtime mode');
select ok(public.get_downtime_read_only_mode(),'downtime mode reads enabled state');
select throws_ok($$insert into public.lab_orders(patient_id) values ('49000000-0000-4000-8000-000000000099')$$,'55000',null,'clinical result-order writes fail closed while downtime mode is active');
select throws_ok($$insert into public.system_settings(setting_key,setting_value) values ('downtime-test-setting','true'::jsonb)$$,'55000',null,'application settings remain read-only during downtime');
select lives_ok($$select public.set_downtime_read_only_mode(false)$$,'Super Admin can disable downtime mode');

reset role;
select * from finish();
rollback;
