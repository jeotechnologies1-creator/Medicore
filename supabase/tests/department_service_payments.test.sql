begin;
select plan(6);

select ok((select exists(select 1 from information_schema.columns where table_schema='public' and table_name='billing' and column_name='department')),'billing has a department routing field');
select ok((select exists(select 1 from information_schema.columns where table_schema='public' and table_name='billing' and column_name='service')),'billing has a service routing field');
select ok(has_function_privilege('authenticated','public.get_portal_payment_accounts()','execute'),'authenticated portal users can call the payment account helper');
select ok(not has_function_privilege('anon','public.get_portal_payment_accounts()','execute'),'anonymous users cannot call the payment account helper');

insert into public.system_settings(setting_key,setting_value)
values('hospital_core_settings','{"bankAccounts":[{"bank":"Test Bank","account":"0000000000"}]}'::jsonb)
on conflict(setting_key) do update set setting_value=excluded.setting_value;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('37000000-0000-4000-8000-000000000001','authenticated','authenticated','portal-payments@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
insert into public.facilities(id,code,name)
values('37000000-0000-4000-8000-000000000002','PORTAL-PAY','Portal Payment Test Facility');
insert into public.patients(id,first_name,last_name,home_facility_id)
values('37000000-0000-4000-8000-000000000003','Portal','Payment','37000000-0000-4000-8000-000000000002');
update public.profiles set role='patient',status='active',patient_id='37000000-0000-4000-8000-000000000003'
where auth_user_id='37000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','37000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"37000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select is(public.get_portal_payment_accounts(), '[{"bank":"Test Bank","account":"0000000000"}]'::jsonb,'active linked patient can fetch configured payment instructions');
reset role;

select * from finish();
rollback;
