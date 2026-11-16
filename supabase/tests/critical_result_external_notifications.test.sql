begin;
select plan(14);

select has_trigger('public','lab_orders','zz_notify_critical_lab_result','finalized critical laboratory results enqueue an external message after acknowledgement setup');
select has_trigger('public','radiology_orders','zz_notify_critical_radiology_result','critical imaging notices use the same PHI-minimized envelope');
select has_function('public','list_critical_result_delivery_status',array[]::text[],'Super Admins can review safe critical-message delivery status');

-- Synthetic fixtures live only in this rollback transaction. TEST-SYSTEM is a
-- local test code system, not a clinical terminology code or patient record.
insert into public.code_systems(code,name) values('TEST-SYSTEM','Synthetic test fixtures') on conflict(code) do nothing;
insert into public.concepts(system,code,display) values('TEST-SYSTEM','SYNTHETIC-CRITICAL-TEST','Synthetic critical result test') on conflict(system,code) do nothing;
insert into public.profiles(id,email,full_name,role,status,phone) values
 ('95000000-0000-4000-8000-000000000001','assigned-clinician@example.test','Synthetic Assigned Clinician','doctor','active','+15550000001'),
 ('95000000-0000-4000-8000-000000000002','escalation-target@example.test','Synthetic Escalation Target','doctor','active','+15550000002');
insert into public.patients(id,first_name,last_name,date_of_birth,gender) values
 ('95000000-0000-4000-8000-000000000010','Synthetic','Test Patient','1990-01-01','unknown');
insert into public.reference_ranges(code_system,test_code,sex,low,high,critical_high,unit,approved,approved_by,approved_at)
values('TEST-SYSTEM','SYNTHETIC-CRITICAL-TEST','any',0,10,50,'synthetic-unit',true,'95000000-0000-4000-8000-000000000001',now());
insert into public.result_escalation_ladder(step_order,step_key,after_minutes,recipient_profile_id,active)
values(2,'department_lead',1,'95000000-0000-4000-8000-000000000002',true)
on conflict(step_order) do update set step_key=excluded.step_key,after_minutes=excluded.after_minutes,recipient_profile_id=excluded.recipient_profile_id,active=true;

insert into public.lab_orders(id,patient_id,doctor_id,responsible_clinician_id,test_type,code_system,code,result_date,results,result_status,status)
values('95000000-0000-4000-8000-000000000020','95000000-0000-4000-8000-000000000010','95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','Synthetic critical fixture','TEST-SYSTEM','SYNTHETIC-CRITICAL-TEST',current_date,
  '{"values":[{"code_system":"TEST-SYSTEM","code":"SYNTHETIC-CRITICAL-TEST","value":99,"unit":"synthetic-unit"}]}'::jsonb,'final','completed');

select is((select count(*)::integer from public.outbound_messages where recipient_profile_id='95000000-0000-4000-8000-000000000001' and template='critical_result_acknowledgement'),1,'a final critical result queues an outbound message for its assigned clinician');
select is((select template from public.outbound_messages where recipient_profile_id='95000000-0000-4000-8000-000000000001' and template='critical_result_acknowledgement' limit 1),'critical_result_acknowledgement','the message uses the dedicated neutral template');
select is((select payload->>'message' from public.outbound_messages where recipient_profile_id='95000000-0000-4000-8000-000000000001' and template='critical_result_acknowledgement' limit 1),'A critical result is awaiting acknowledgement.','the queued text contains only the generic acknowledgement prompt');
select is((select jsonb_object_length(payload) from public.outbound_messages where recipient_profile_id='95000000-0000-4000-8000-000000000001' and template='critical_result_acknowledgement' limit 1),2,'the queued payload contains only message and opaque reference');
select ok((select payload ? 'reference' and not (payload ?| array['patient_id','patient_name','result_id','result_value','diagnosis','result_type']) from public.outbound_messages where recipient_profile_id='95000000-0000-4000-8000-000000000001' and template='critical_result_acknowledgement' limit 1),'the external queue payload excludes patient and clinical details');
select is((select channel from public.outbound_messages where recipient_profile_id='95000000-0000-4000-8000-000000000001' and template='critical_result_acknowledgement' limit 1),'email','a configured external address selects a provider-neutral email channel');

update public.lab_orders set result_status='corrected',results='{"values":[{"code_system":"TEST-SYSTEM","code":"SYNTHETIC-CRITICAL-TEST","value":101,"unit":"synthetic-unit"}]}'::jsonb
where id='95000000-0000-4000-8000-000000000020';
select is((select count(*)::integer from public.outbound_messages where recipient_profile_id='95000000-0000-4000-8000-000000000001' and template='critical_result_acknowledgement'),2,'a corrected critical result queues a fresh notice');

update public.result_acknowledgements set escalation_step=1,next_escalation_at=now()-interval '1 minute',due_at=now()-interval '1 minute'
where result_type='laboratory' and result_id='95000000-0000-4000-8000-000000000020';
select is(public.escalate_overdue_results(),1,'overdue critical result advances to its configured escalation recipient');
select is((select count(*)::integer from public.outbound_messages where recipient_profile_id='95000000-0000-4000-8000-000000000002' and template='critical_result_acknowledgement'),1,'escalation queues the generic notice for the escalation target');
select ok((select jsonb_object_length(payload)=2 and payload ? 'reference' from public.outbound_messages where recipient_profile_id='95000000-0000-4000-8000-000000000002' and template='critical_result_acknowledgement' limit 1),'escalation payload is also limited to the opaque reference and generic message');

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('95000000-0000-4000-8000-000000000099','authenticated','authenticated','synthetic-alert-admin@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='super_admin',status='active' where auth_user_id='95000000-0000-4000-8000-000000000099';
update public.outbound_messages set status='failed',attempts=8,last_error='synthetic failure' where recipient_profile_id='95000000-0000-4000-8000-000000000002' and template='critical_result_acknowledgement';
set local role authenticated;
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000099',true);
select set_config('request.jwt.claims','{"sub":"95000000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal2"}',true);
select ok((public.get_operations_alerts()->>'undelivered_critical_result_messages')::integer>=1,'undelivered critical messages raise the operations alert counter');
select ok(exists(select 1 from public.list_critical_result_delivery_status() where delivery_status='failed' and status_detail='Delivery failed after retry limit'),'Super Admin can see failed status without recipient or clinical data');

reset role;
select * from finish();
rollback;
