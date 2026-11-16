begin;
set local lock_timeout='2s';
do $$ begin
 if exists(select 1 from public.procurement_invoices) or exists(select 1 from public.accounting_periods where status='closed')
   or exists(select 1 from public.journal_entries where source_type in ('manual_adjustment','procurement_invoice','procurement_invoice_payment'))
   or exists(select 1 from public.journal_entries e join public.accounting_periods p on p.facility_id=e.facility_id and e.posted_at::date between p.starts_on and p.ends_on) then
  raise exception 'Rollback refused: supplier invoices, closed periods, or accounting adjustments exist; preserve finance history and fix forward.';
 end if;
end $$;
drop trigger if exists journal_open_period_guard on public.journal_entries;
drop trigger if exists procurement_invoice_journal on public.procurement_invoices;
drop trigger if exists procurement_invoice_payment_journal on public.procurement_invoice_payments;
drop trigger if exists audit_procurement_invoice_payments on public.procurement_invoice_payments;
drop trigger if exists seed_ap_ledger_after_facility on public.facilities;
drop trigger if exists seed_accounting_period_after_facility on public.facilities;
drop trigger if exists audit_accounting_periods on public.accounting_periods;
drop trigger if exists accounting_period_guard on public.accounting_periods;
drop trigger if exists audit_procurement_invoices on public.procurement_invoices;
drop trigger if exists procurement_invoice_guard on public.procurement_invoices;
drop function if exists public.guard_journal_open_period();
drop function if exists public.post_procurement_invoice();
drop function if exists public.post_procurement_invoice_payment();
drop function if exists public.seed_ap_ledger_for_new_facility();
drop function if exists public.seed_ap_ledger_for_facility(uuid);
drop function if exists public.seed_accounting_period_for_facility();
drop function if exists public.seed_accounting_period(uuid);
drop function if exists public.guard_accounting_period();
drop function if exists public.guard_procurement_invoice();
drop function if exists public.create_accounting_period(uuid,text,date,date);
drop function if exists public.close_accounting_period(uuid);
drop function if exists public.record_procurement_invoice(uuid,text,text,date,date,numeric,text,text);
drop function if exists public.record_procurement_invoice_payment(uuid,numeric);
drop function if exists public.post_ledger_adjustment(uuid,uuid,text,jsonb);
drop view if exists public.accounts_receivable_ageing;
drop view if exists public.accounts_payable_ageing;
drop view if exists public.trial_balance_report;
drop table public.procurement_invoice_payments;
drop table public.procurement_invoices;
drop table public.accounting_periods;
delete from public.role_permission_grants where permission_key in ('accounting.read','accounting.manage','accounting.period.manage');
delete from public.permission_catalog where permission_key in ('accounting.read','accounting.manage','accounting.period.manage')
 and not exists(select 1 from public.profile_permission_assignments where permission_key in ('accounting.read','accounting.manage','accounting.period.manage'));
-- Facility ledger accounts and posting rules are retained because a facility may
-- already have had account codes 2000/5000 before this migration was applied.
notify pgrst,'reload schema';
commit;
