begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- Refuse to discard a prescription-to-invoice link after it has been used.
do $$
begin
  if exists(select 1 from public.billing where prescription_id is not null) then
    raise exception 'Rollback refused: pharmacy prescription invoices exist; preserve the billing link and use a forward migration.';
  end if;
end $$;

drop trigger if exists prescriptions_require_paid_pharmacy_invoice on public.prescriptions;
drop trigger if exists audit_pharmacy_invoice_lines on public.pharmacy_invoice_lines;
drop trigger if exists guard_pharmacy_invoice_line_history on public.pharmacy_invoice_lines;
drop function if exists public.require_paid_pharmacy_invoice_for_dispense();
drop function if exists public.guard_pharmacy_invoice_line_history();
drop function if exists public.create_pharmacy_prescription_invoice(uuid);
drop function if exists public.get_pharmacy_prescription_invoice_status(uuid[]);
drop function if exists public.get_pharmacy_sales(uuid);
drop table if exists public.pharmacy_invoice_lines;
drop index if exists public.billing_one_pharmacy_invoice_per_prescription_idx;
alter table public.billing drop column if exists prescription_id;

notify pgrst,'reload schema';
commit;
