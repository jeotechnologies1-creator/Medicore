begin;
select plan(17);
select has_table('public','service_charge_catalogue','facility charge catalogue exists');
select has_table('public','service_charge_prices','approved price history exists');
select has_table('public','invoice_line_items','invoice rows retain catalogue price snapshots');
select has_table('public','invoice_credit_notes','invoice corrections use append-only credit notes');
select has_trigger('public','service_charge_catalogue','audit_service_charge_catalogue','catalogue writes are audited');
select has_trigger('public','service_charge_prices','audit_service_charge_prices','price requests and approvals are audited');

insert into public.facilities(id,code,name) values
 ('a5500000-0000-4000-8000-000000000001','TEST-CHARGE-A','TEST Charge Facility A'),
 ('a5500000-0000-4000-8000-000000000002','TEST-CHARGE-B','TEST Charge Facility B');
insert into public.organization_units(id,facility_id,unit_type,code,name) values
 ('a5500000-0000-4000-8000-000000000003','a5500000-0000-4000-8000-000000000001','department','TEST-ACCT-A','TEST Accounts A'),
 ('a5500000-0000-4000-8000-000000000004','a5500000-0000-4000-8000-000000000002','department','TEST-ACCT-B','TEST Accounts B');
insert into public.patients(id,first_name,last_name,home_facility_id) values
 ('a5500000-0000-4000-8000-000000000005','TEST','Patient A','a5500000-0000-4000-8000-000000000001');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('a5500000-0000-4000-8000-000000000010','authenticated','authenticated','TEST-charge-a@example.test',now(),'{}','{}',now(),now()),
 ('a5500000-0000-4000-8000-000000000011','authenticated','authenticated','TEST-charge-b@example.test',now(),'{}','{}',now(),now()),
 ('a5500000-0000-4000-8000-000000000012','authenticated','authenticated','TEST-charge-other@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='accountant',status='active',facility_id='a5500000-0000-4000-8000-000000000001' where auth_user_id in ('a5500000-0000-4000-8000-000000000010','a5500000-0000-4000-8000-000000000011');
update public.profiles set role='accountant',status='active',facility_id='a5500000-0000-4000-8000-000000000002' where auth_user_id='a5500000-0000-4000-8000-000000000012';
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select p.id,'a5500000-0000-4000-8000-000000000003',p.id,'TEST catalogue facility scope'
from public.profiles p where p.auth_user_id in ('a5500000-0000-4000-8000-000000000010','a5500000-0000-4000-8000-000000000011');
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
select p.id,'a5500000-0000-4000-8000-000000000004',p.id,'TEST catalogue facility scope'
from public.profiles p where p.auth_user_id='a5500000-0000-4000-8000-000000000012';

set local role authenticated;
select set_config('request.jwt.claim.sub','a5500000-0000-4000-8000-000000000010',true);
select set_config('test.charge_request',public.request_service_charge_price('a5500000-0000-4000-8000-000000000001','TEST-CODE','TEST charge item','TEST department',123.45,current_date,null,null)::text,true);
select throws_ok($$select public.approve_service_charge_price(current_setting('test.charge_request')::uuid)$$,'P0001','A different person must approve the price change.','requester cannot approve their own price change');
select is((select count(*)::integer from public.service_charge_catalogue where facility_id='a5500000-0000-4000-8000-000000000002'),0,'facility A accountant cannot read facility B catalogue');
select set_config('request.jwt.claim.sub','a5500000-0000-4000-8000-000000000011',true);
select lives_ok($$select public.approve_service_charge_price(current_setting('test.charge_request')::uuid)$$,'second accountant can approve facility A price');
select is((select count(*)::integer from public.service_charge_prices where id=current_setting('test.charge_request')::uuid and status='active' and requested_by<>approved_by),1,'approved price history records distinct requester and approver');
select set_config('test.charge_invoice',public.create_catalogued_invoice('a5500000-0000-4000-8000-000000000005','TEST-CHARGE-INVOICE',jsonb_build_array(jsonb_build_object('catalogue_item_id',(select catalogue_item_id from public.service_charge_prices where id=current_setting('test.charge_request')::uuid),'quantity',2)))::text,true);
select is((select unit_price from public.invoice_line_items where billing_id=current_setting('test.charge_invoice')::uuid),123.45::numeric,'invoice stores the approved unit price snapshot');
select set_config('request.jwt.claim.sub','a5500000-0000-4000-8000-000000000010',true);
select set_config('test.charge_request_2',public.request_service_charge_price('a5500000-0000-4000-8000-000000000001','TEST-CODE','TEST charge item','TEST department',200.00,current_date+1,null,(select catalogue_item_id from public.service_charge_prices where id=current_setting('test.charge_request')::uuid))::text,true);
select set_config('request.jwt.claim.sub','a5500000-0000-4000-8000-000000000011',true);
select lives_ok($$select public.approve_service_charge_price(current_setting('test.charge_request_2')::uuid)$$,'second person approves a later price version');
reset role;
select throws_ok(format('update public.invoice_line_items set unit_price=999 where billing_id=%L::uuid',current_setting('test.charge_invoice')),'P0001','Invoice line items and credit notes are append-only.','invoice price snapshots cannot be rewritten');
select throws_ok(format('update public.billing set total=1 where id=%L::uuid',current_setting('test.charge_invoice')),'P0001','Issued invoice details are immutable; issue a credit note for corrections.','issued invoice totals cannot be rewritten');
select is((select unit_price from public.invoice_line_items where billing_id=current_setting('test.charge_invoice')::uuid),123.45::numeric,'later price approval never rewrites a past invoice');
select lives_ok(format('select public.issue_invoice_credit_note(%L::uuid,null,10,''TEST correction'')',current_setting('test.charge_invoice')),'credit note can correct an issued invoice without editing it');
select is((select total from public.billing where id=current_setting('test.charge_invoice')::uuid),246.90::numeric,'credit note leaves the original invoice total immutable');
select * from finish();
rollback;
