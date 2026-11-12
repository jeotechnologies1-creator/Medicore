begin;
select plan(10);

insert into public.facilities(id,code,name)
values('35000000-0000-4000-8000-000000000001','MFA-TEST','Synthetic MFA Test Facility');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('35000000-0000-4000-8000-000000000002','authenticated','authenticated','mfa-test@example.test',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='super_admin',status='active' where auth_user_id='35000000-0000-4000-8000-000000000002';

select is((select setting_value->>'enabled' from public.system_settings where setting_key='mfa_enforcement'),'true','MFA enforcement defaults on');
set local role authenticated;
select set_config('request.jwt.claim.sub','35000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"35000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select ok(not public.has_aal2(),'AAL1 is not treated as AAL2');
select ok(public.mfa_required_for_current_user(),'Super Admin requires AAL2 by default');
select ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join (values('require aal2 for insert'),('require aal2 for update'),('require aal2 for delete')) expected(policy_name)
  where n.nspname='public' and c.relkind in ('r','p') and not exists (
    select 1 from pg_policy p where p.polrelid=c.oid and p.polname=expected.policy_name
      and not p.polpermissive and 'authenticated'::regrole::oid=any(p.polroles)
  )
), 'every public table has restrictive insert, update, and delete AAL2 gates');
select ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and not exists (
    select 1 from pg_trigger t where t.tgrelid=c.oid and t.tgname='enforce_aal2_for_sensitive_write' and not t.tgisinternal
  )
), 'every public table has a trigger guard for SECURITY DEFINER writes');
select throws_ok($$insert into public.patients(first_name,last_name,home_facility_id) values ('Synthetic','MFA AAL1','35000000-0000-4000-8000-000000000001')$$,'42501',null,'AAL1 cannot write protected data');
select set_config('request.jwt.claims','{"sub":"35000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select ok(public.has_aal2(),'AAL2 claim is recognized');
select lives_ok($$select public.register_patient_with_identity_check('MFA-AAL2','Synthetic','MFA AAL2',date '1990-01-01','other','+2348000000101',null,null,null,null,null,'35000000-0000-4000-8000-000000000001')$$,'AAL2 can register through the duplicate-safe workflow');

reset role;
update public.system_settings set setting_value='{"enabled":false}'::jsonb where setting_key='mfa_enforcement';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select ok(not public.mfa_required_for_current_user(),'explicit system setting can disable the role gate');
select lives_ok($$select public.register_patient_with_identity_check('MFA-SWITCH-OFF','Synthetic','MFA switch off',date '1990-01-02','other','+2348000000102',null,null,null,null,null,'35000000-0000-4000-8000-000000000001')$$,'AAL1 can register through the workflow only when the explicit switch is off');

reset role;
select * from finish();
rollback;
