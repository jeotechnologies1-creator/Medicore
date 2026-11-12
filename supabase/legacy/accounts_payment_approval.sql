-- Payments remain pending until an Accounts user approves them.
create table if not exists public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  billing_id uuid not null references public.billing(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null,
  reference text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.validate_payment_submission_invoice()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.billing b where b.id = new.billing_id and b.patient_id = new.patient_id) then
    raise exception 'Payment patient must match the invoice patient.';
  end if;
  return new;
end;
$$;
drop trigger if exists payment_submission_invoice_matches_patient on public.payment_submissions;
create trigger payment_submission_invoice_matches_patient before insert or update on public.payment_submissions
  for each row execute function public.validate_payment_submission_invoice();

alter table public.payment_submissions enable row level security;
drop policy if exists "finance and patient read payments" on public.payment_submissions;
create policy "finance and patient read payments" on public.payment_submissions for select
  using (public.has_any_role(array['super_admin','accountant','receptionist']) or public.can_access_patient(patient_id));
drop policy if exists "staff submit payments for approval" on public.payment_submissions;
create policy "staff submit payments for approval" on public.payment_submissions for insert
  with check (public.has_any_role(array['super_admin','accountant','receptionist']) and status = 'pending');

create or replace function public.prevent_unapproved_billing_payment()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.paid, 0) <> 0 or new.status in ('paid','partial') then
      raise exception 'New invoices cannot include unapproved payments.';
    end if;
    return new;
  end if;
  if current_setting('onemed.approving_payment', true) is distinct from 'yes'
     and (new.paid is distinct from old.paid or new.balance is distinct from old.balance
          or new.status is distinct from old.status or new.payment_method is distinct from old.payment_method) then
    raise exception 'Payments can only be posted after Accounts approval.';
  end if;
  return new;
end;
$$;
drop trigger if exists billing_requires_payment_approval on public.billing;
create trigger billing_requires_payment_approval before insert or update on public.billing
  for each row execute function public.prevent_unapproved_billing_payment();

create or replace function public.review_payment_submission(p_payment_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public as $$
declare payment_row public.payment_submissions%rowtype; invoice_row public.billing%rowtype; paid_total numeric(12,2);
begin
  if not public.has_any_role(array['super_admin','accountant']) then
    raise exception 'Only the Accounts department can review payments.';
  end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid payment decision.'; end if;
  select * into payment_row from public.payment_submissions where id = p_payment_id for update;
  if not found or payment_row.status <> 'pending' then raise exception 'Payment is not awaiting review.'; end if;
  if p_decision = 'approved' then
    select * into invoice_row from public.billing where id = payment_row.billing_id for update;
    if not found or payment_row.amount > coalesce(invoice_row.balance, 0) then raise exception 'Payment exceeds the outstanding invoice balance.'; end if;
    paid_total := coalesce(invoice_row.paid, 0) + payment_row.amount;
    perform set_config('onemed.approving_payment', 'yes', true);
    update public.billing set paid = paid_total, balance = greatest(0, total - paid_total),
      status = case when paid_total >= total then 'paid' else 'partial' end,
      payment_method = payment_row.payment_method where id = invoice_row.id;
  end if;
  update public.payment_submissions set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now() where id = p_payment_id;
end;
$$;
revoke all on function public.review_payment_submission(uuid,text) from public;
grant execute on function public.review_payment_submission(uuid,text) to authenticated;

grant select, insert on public.payment_submissions to authenticated;
