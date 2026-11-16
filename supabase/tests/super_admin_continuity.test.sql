begin;
select plan(9);

select has_function('public','get_active_super_admin_count',array[]::text[],'active Super Admin count RPC exists');
select has_trigger('public','profiles','protect_last_active_super_admin','profile trigger protects the last active Super Admin');

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('96000000-0000-4000-8000-000000000001','authenticated','authenticated','continuity-admin-one@example.test',now(),'{}','{}',now(),now()),
 ('96000000-0000-4000-8000-000000000002','authenticated','authenticated','continuity-admin-two@example.test',now(),'{}','{}',now(),now());
insert into public.profiles(id,auth_user_id,email,full_name,role,status)
values
 ('96000000-0000-4000-8000-000000000011','96000000-0000-4000-8000-000000000001','continuity-admin-one@example.test','Synthetic Continuity Admin One','super_admin','active'),
 ('96000000-0000-4000-8000-000000000012','96000000-0000-4000-8000-000000000002','continuity-admin-two@example.test','Synthetic Continuity Admin Two','super_admin','active');

set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"96000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select is(public.get_active_super_admin_count(),2,'authorized Super Admin receives the current active count');
reset role;

select lives_ok($$update public.profiles set role='doctor' where id='96000000-0000-4000-8000-000000000011'$$,'one Super Admin can be demoted while another remains active');
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"96000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select is(public.get_active_super_admin_count(),1,'count reflects the remaining active Super Admin');
reset role;
select throws_ok($$update public.profiles set role='doctor' where id='96000000-0000-4000-8000-000000000012'$$,'P0001','Cannot demote, suspend, or delete the last active Super Admin. Activate another Super Admin first.','demoting the last active Super Admin is blocked');
select throws_ok($$update public.profiles set status='suspended' where id='96000000-0000-4000-8000-000000000012'$$,'P0001','Cannot demote, suspend, or delete the last active Super Admin. Activate another Super Admin first.','suspending the last active Super Admin is blocked');
select throws_ok($$delete from public.profiles where id='96000000-0000-4000-8000-000000000012'$$,'P0001','Cannot demote, suspend, or delete the last active Super Admin. Activate another Super Admin first.','deleting the last active Super Admin is blocked');
set local role authenticated;
select is(public.get_active_super_admin_count(),1,'blocked changes leave the last active Super Admin intact');
reset role;

select * from finish();
rollback;
