begin;
select plan(9);

select has_table('public','gateway_refund_requests','gateway refund queue exists');
select has_column('public','payment_provider_transactions','provider_reference','provider intent reference is persisted');
select has_column('public','payment_provider_transactions','provider_transaction_id','provider transaction id is persisted');
select has_trigger('public','payment_reversals','queue_gateway_refund_after_approval','approved reversals enqueue an idempotent gateway refund');
select has_trigger('public','integration_outbox','sync_gateway_outbox_response','delivered outbox responses synchronize provider transaction state');
select has_function('public','process_payment_refund_event',array['uuid','text','jsonb'],'refund webhook processor exists');
select ok(has_function_privilege('service_role','public.process_payment_refund_event(uuid,text,jsonb)','EXECUTE'),'service role can process verified refund webhooks');
select ok(not has_function_privilege('authenticated','public.process_payment_refund_event(uuid,text,jsonb)','EXECUTE'),'authenticated users cannot process provider callbacks');

insert into public.facilities(id,code,name) values('64000000-0000-4000-8000-000000000001','GW-TEST','Synthetic Gateway Facility');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('64000000-0000-4000-8000-000000000002','authenticated','authenticated','gateway-test@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='accountant',status='active',facility_id='64000000-0000-4000-8000-000000000001' where auth_user_id='64000000-0000-4000-8000-000000000002';
insert into public.patients(id,first_name,last_name,home_facility_id) values('64000000-0000-4000-8000-000000000003','Synthetic','Gateway Patient','64000000-0000-4000-8000-000000000001');
insert into public.billing(id,patient_id,invoice_number,total,paid,balance,status) values('64000000-0000-4000-8000-000000000004','64000000-0000-4000-8000-000000000003','GW-TEST-INVOICE',20,0,20,'pending');
insert into public.integration_connections(id,facility_id,integration_type,provider_code,status) values('64000000-0000-4000-8000-000000000005','64000000-0000-4000-8000-000000000001','payment_gateway','synthetic-gw','active');
insert into public.payment_provider_transactions(id,connection_id,billing_id,patient_id,amount,currency,idempotency_key,created_by)
values('64000000-0000-4000-8000-000000000006','64000000-0000-4000-8000-000000000005','64000000-0000-4000-8000-000000000004','64000000-0000-4000-8000-000000000003',20,'NGN','GW-TEST-INTENT',(select id from public.profiles where auth_user_id='64000000-0000-4000-8000-000000000002'));
insert into public.integration_outbox(id,connection_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
values('64000000-0000-4000-8000-000000000007','64000000-0000-4000-8000-000000000005','payment.intent.create','payment_provider_transaction','64000000-0000-4000-8000-000000000006','GW-TEST-OUTBOX','{}');
update public.integration_outbox set status='delivered',response='{"reference":"SYNTH-REFERENCE","id":"SYNTH-TXN"}' where id='64000000-0000-4000-8000-000000000007';
select is((select provider_reference from public.payment_provider_transactions where id='64000000-0000-4000-8000-000000000006'),'SYNTH-REFERENCE','provider reference arrives through the delivered outbox trigger');
select * from finish();
rollback;
