begin;
select plan(27);
select has_table('public','accounting_periods','accounting periods are stored by facility');
select has_table('public','procurement_invoices','accounts payable source invoices exist');
select has_view('public','accounts_receivable_ageing','AR ageing report exists');
select has_view('public','accounts_payable_ageing','AP ageing report exists');
select has_view('public','trial_balance_report','trial balance report exists');
select has_trigger('public','journal_entries','journal_open_period_guard','every journal insert checks an open period');

insert into public.facilities(id,code,name) values ('a6600000-0000-4000-8000-000000000001','TEST-ARAP','TEST AR AP Facility');
insert into public.patients(id,first_name,last_name,home_facility_id) values
 ('a6600000-0000-4000-8000-000000000002','TEST','AR Patient','a6600000-0000-4000-8000-000000000001');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('a6600000-0000-4000-8000-000000000003','authenticated','authenticated','arap-accountant@example.test',now(),'{}','{}',now(),now()),
 ('a6600000-0000-4000-8000-000000000004','authenticated','authenticated','arap-doctor@example.test',now(),'{}','{}',now(),now());
update public.profiles set role='accountant',status='active',facility_id='a6600000-0000-4000-8000-000000000001' where auth_user_id='a6600000-0000-4000-8000-000000000003';
update public.profiles set role='doctor',status='active',facility_id='a6600000-0000-4000-8000-000000000001' where auth_user_id='a6600000-0000-4000-8000-000000000004';
insert into public.organization_units(id,facility_id,unit_type,code,name) values
 ('a6600000-0000-4000-8000-000000000005','a6600000-0000-4000-8000-000000000001','department','TEST-ARAP-ACCOUNTS','TEST ARAP Accounts');
insert into public.staff_organization_memberships(profile_id,organization_unit_id,assigned_by,justification)
 select id,'a6600000-0000-4000-8000-000000000005',id,'AR AP accounting test' from public.profiles where auth_user_id='a6600000-0000-4000-8000-000000000003';
insert into public.billing(id,patient_id,invoice_number,total,paid,balance,status) values
 ('a6600000-0000-4000-8000-000000000006','a6600000-0000-4000-8000-000000000002','AR-AGE-001',50,0,50,'pending');
select set_config('test.arap_facility','a6600000-0000-4000-8000-000000000001',true);
select set_config('test.arap_accountant',(select id::text from public.profiles where auth_user_id='a6600000-0000-4000-8000-000000000003'),true);
select set_config('test.arap_period',(select id::text from public.accounting_periods where facility_id='a6600000-0000-4000-8000-000000000001' and starts_on<=current_date and ends_on>=current_date),true);
select is((select count(*)::integer from public.accounting_periods where facility_id=current_setting('test.arap_facility')::uuid and status='open' and current_date between starts_on and ends_on),1,'facility provisioning seeds an open current accounting period');

set local role authenticated;
select set_config('request.jwt.claim.sub','a6600000-0000-4000-8000-000000000003',true);
select set_config('test.ap_invoice',public.record_procurement_invoice(current_setting('test.arap_facility')::uuid,'Test Supplier','SUP-001',current_date-50,current_date-20,120,'NGN','Fixture supplier invoice')::text,true);
select is((select count(*)::integer from public.journal_entries where source_type='procurement_invoice' and source_id=current_setting('test.ap_invoice')::uuid and event_type='procurement.invoice.received'),1,'supplier invoice posts an immutable balanced ledger entry');
select is((select outstanding from public.accounts_payable_ageing where invoice_id=current_setting('test.ap_invoice')::uuid),120::numeric,'AP report shows an unpaid procurement invoice');
select is((select days_1_30 from public.accounts_payable_ageing where invoice_id=current_setting('test.ap_invoice')::uuid),120::numeric,'AP ageing uses the supplier invoice due date');
select is(public.record_procurement_invoice_payment(current_setting('test.ap_invoice')::uuid,20,'arap-test-payment-001'),20::numeric,'accounts payable workflow records a partial supplier payment');
select is((select count(*)::integer from public.journal_entries e join public.procurement_invoice_payments p on p.id=e.source_id where p.procurement_invoice_id=current_setting('test.ap_invoice')::uuid and e.source_type='procurement_invoice_payment' and e.event_type='procurement.invoice.paid'),1,'supplier payment posts an immutable ledger entry');
select is((select outstanding from public.accounts_payable_ageing where invoice_id=current_setting('test.ap_invoice')::uuid),100::numeric,'AP report deducts supplier payments from the balance due');
select is((select current_amount from public.accounts_receivable_ageing where invoice_id='a6600000-0000-4000-8000-000000000006'),50::numeric,'AR report shows the current invoice balance');
select is((select sum(debit_total-credit_total) from public.trial_balance_report where facility_id=current_setting('test.arap_facility')::uuid and accounting_period_id=current_setting('test.arap_period')::uuid),0::numeric,'trial balance balances posted ledger entries');
select set_config('request.jwt.claim.sub','a6600000-0000-4000-8000-000000000004',true);
select is((select count(*)::integer from public.accounts_payable_ageing),0,'non-finance roles cannot read AP ageing');
select is((select count(*)::integer from public.accounts_receivable_ageing),0,'non-finance roles cannot read AR ageing');
select is((select count(*)::integer from public.trial_balance_report),0,'non-finance roles cannot read trial balance');
select is((select count(*)::integer from public.procurement_invoices),0,'non-finance roles cannot read supplier invoices');
select is((select count(*)::integer from public.accounting_periods),0,'non-finance roles cannot read accounting periods');
reset role;

select set_config('request.jwt.claim.sub','a6600000-0000-4000-8000-000000000003',true);
set local role authenticated;
select set_config('test.adjustment',public.post_ledger_adjustment(current_setting('test.arap_facility')::uuid,current_setting('test.arap_period')::uuid,'Test balanced adjustment',
 '[{"account_code":"1000","debit":25,"credit":0},{"account_code":"4000","debit":0,"credit":25}]'::jsonb)::text,true);
select is((select sum(debit-credit) from public.journal_lines where journal_entry_id=current_setting('test.adjustment')::uuid),0::numeric,'manual ledger correction is balanced and immutable');
select set_config('test.closed_period',public.create_accounting_period(current_setting('test.arap_facility')::uuid,'TEST-CLOSED-2027','2027-01-01','2027-12-31')::text,true);
select throws_ok(format('select public.close_accounting_period(%L::uuid)',current_setting('test.closed_period')),'P0001','Accounting periods must be closed in chronological order.','a later period cannot be closed before an earlier open period');
select lives_ok(format('select public.close_accounting_period(%L::uuid)',current_setting('test.arap_period')),'finance staff can close the balanced current accounting period');
select set_config('test.next_adjustment',public.post_ledger_adjustment(current_setting('test.arap_facility')::uuid,current_setting('test.closed_period')::uuid,'Correction in next open period',
 '[{"account_code":"1000","debit":5,"credit":0},{"account_code":"4000","debit":0,"credit":5}]'::jsonb)::text,true);
select is((select posted_at::date from public.journal_entries where id=current_setting('test.next_adjustment')::uuid),'2027-01-01'::date,'correction posts on the next open period date');
select lives_ok(format('select public.close_accounting_period(%L::uuid)',current_setting('test.closed_period')),'finance staff can close the next period in chronological order');
select is((select status from public.accounting_periods where id=current_setting('test.closed_period')::uuid),'closed','close operation records the closed state');
reset role;
select throws_ok(format($q$insert into public.journal_entries(facility_id,source_type,source_id,event_type,memo,amount,posted_at)
 values(%L::uuid,'test',gen_random_uuid(),'test.closed','Must be rejected',1,'2027-06-01'::date::timestamptz)$q$,current_setting('test.arap_facility')),
 'P0001','No open accounting period covers this posting date. Post corrections in the next open period.','database trigger rejects a posting dated in a closed period');
select * from finish();
rollback;
