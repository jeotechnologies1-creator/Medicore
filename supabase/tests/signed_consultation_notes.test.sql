begin;
select plan(20);
select has_column('public','consultations','note_state','consultations distinguish draft and signed notes');
select has_table('public','consultation_signatures','consultation signatures retain author and authentication identity');
select has_table('public','consultation_addenda','corrections are appended as attributed addenda');
select has_function('public','sign_consultation',array['uuid'],'consultations have a controlled signing workflow');
select has_function('public','add_consultation_addendum',array['uuid','text','text'],'addenda require reason and content');
select has_trigger('public','consultations','guard_signed_consultation','signed consultation rows are guarded by a trigger');
select has_trigger('public','consultation_signatures','consultation_signatures_immutable','signature history is immutable');
select has_trigger('public','consultation_addenda','consultation_addenda_immutable','addendum history is immutable');
select ok((select relrowsecurity from pg_class where oid='public.consultation_addenda'::regclass),'addenda have row-level security');
select has_policy('public','consultation_addenda','clinical staff read consultation addenda','addenda reads require clinical facility permission');

-- Synthetic TEST identities, patient and encounter; all fixtures roll back below.
insert into public.facilities(id,code,name) values('a5560000-0000-4000-8000-000000000001','TEST-NOTE','TEST Note Facility');
insert into public.facilities(id,code,name) values('a5560000-0000-4000-8000-000000000002','TEST-NOTE-B','TEST Other Facility');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('a5560000-0000-4000-8000-000000000010','authenticated','authenticated','TEST-note-author@example.invalid',now(),'{}','{}',now(),now());
update public.profiles set role='doctor',status='active',facility_id='a5560000-0000-4000-8000-000000000001' where auth_user_id='a5560000-0000-4000-8000-000000000010';
insert into public.patients(id,first_name,last_name,home_facility_id) values('a5560000-0000-4000-8000-000000000020','TEST','Note Patient','a5560000-0000-4000-8000-000000000001');
insert into public.patients(id,first_name,last_name,home_facility_id) values('a5560000-0000-4000-8000-000000000021','TEST','Other Facility Patient','a5560000-0000-4000-8000-000000000002');
insert into public.organization_units(id,facility_id,unit_type,code,name) values('a5560000-0000-4000-8000-000000000050','a5560000-0000-4000-8000-000000000001','department','TEST-MEDICAL','Medical');
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification,is_primary)
select id,'a5560000-0000-4000-8000-000000000050',id,'TEST consultation note access',true from public.profiles where auth_user_id='a5560000-0000-4000-8000-000000000010';
insert into public.encounters(id,patient_id,attending_clinician_id,encounter_type,status,reason_for_visit)
select 'a5560000-0000-4000-8000-000000000030','a5560000-0000-4000-8000-000000000020',id,'outpatient','in_progress','TEST synthetic visit'
from public.profiles where auth_user_id='a5560000-0000-4000-8000-000000000010';
set local role authenticated;
select set_config('request.jwt.claim.sub','a5560000-0000-4000-8000-000000000010',true);
select ok(not public.has_clinical_department_permission('a5560000-0000-4000-8000-000000000021','Medical','encounter.update',false),'clinician cannot read or amend notes outside the assigned facility');
select throws_ok($$insert into public.consultations(patient_id,doctor_id,chief_complaint) select 'a5560000-0000-4000-8000-000000000020',id,'TEST no encounter' from public.profiles where auth_user_id='a5560000-0000-4000-8000-000000000010'$$,'P0001','Encounter context and author are required for consultation notes.','new consultation note cannot omit encounter context');
insert into public.consultations(id,patient_id,encounter_id,doctor_id,chief_complaint,assessment,plan,note_state,status)
select 'a5560000-0000-4000-8000-000000000040','a5560000-0000-4000-8000-000000000020','a5560000-0000-4000-8000-000000000030',id,'TEST synthetic complaint','TEST assessment','TEST plan','draft','draft'
from public.profiles where auth_user_id='a5560000-0000-4000-8000-000000000010';
select lives_ok($$select public.sign_consultation('a5560000-0000-4000-8000-000000000040')$$,'assigned clinician can sign an encounter-linked draft');
select throws_ok($$update public.consultations set assessment='TEST altered' where id='a5560000-0000-4000-8000-000000000040'$$,'P0001','Signed consultation notes are immutable; record a reasoned addendum.','signed content cannot be edited by an authenticated user');
set local role service_role;
select throws_ok($$update public.consultations set assessment='TEST admin altered' where id='a5560000-0000-4000-8000-000000000040'$$,'P0001','Signed consultation notes are immutable; record a reasoned addendum.','signed content cannot be edited even by elevated database role');
set local role authenticated;
select throws_ok($$delete from public.consultations where id='a5560000-0000-4000-8000-000000000040'$$,'P0001','Signed consultation notes cannot be deleted; record a reasoned addendum.','signed content cannot be deleted');
select throws_ok($$select public.add_consultation_addendum('a5560000-0000-4000-8000-000000000040','  ','TEST correction')$$,'P0001','A correction reason is required.','addendum requires a non-empty reason');
select lives_ok($$select public.add_consultation_addendum('a5560000-0000-4000-8000-000000000040','TEST reason','TEST correction')$$,'authorized clinician can append attributed correction');
reset role;
select is((select count(*)::integer from public.consultation_signatures where consultation_id='a5560000-0000-4000-8000-000000000040'),1,'signature records exactly one author and timestamp');
select is((select count(*)::integer from public.consultation_addenda where consultation_id='a5560000-0000-4000-8000-000000000040' and reason='TEST reason'),1,'addendum history retains the reason');
select * from finish();
rollback;
