-- Idempotent payment posting and two-person refund review.
-- Apply after organization_permissions.sql.

alter table public.payment_submissions add column if not exists idempotency_key text;
update public.payment_submissions set idempotency_key='legacy-'||id::text where idempotency_key is null;
alter table public.payment_submissions alter column idempotency_key set not null;
create unique index if not exists payment_submissions_idempotency_idx on public.payment_submissions(idempotency_key);

create table if not exists public.payment_postings (
  id uuid primary key default gen_random_uuid(),
  payment_submission_id uuid not null unique references public.payment_submissions(id) on delete restrict,
  billing_id uuid not null references public.billing(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  amount numeric(12,2) not null check(amount>0),
  payment_method text not null,
  external_reference text,
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now()
);
create index if not exists payment_postings_billing_idx on public.payment_postings(billing_id,recorded_at);

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  payment_posting_id uuid not null references public.payment_postings(id) on delete restrict,
  amount numeric(12,2) not null check(amount>0),
  reason text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  check((status='pending' and reviewed_by is null and reviewed_at is null) or (status<>'pending' and reviewed_by is not null and reviewed_at is not null))
);
create index if not exists refund_requests_status_idx on public.refund_requests(status,created_at);
create table if not exists public.payment_reversals (
  id uuid primary key default gen_random_uuid(),
  refund_request_id uuid not null unique references public.refund_requests(id) on delete restrict,
  payment_posting_id uuid not null references public.payment_postings(id) on delete restrict,
  amount numeric(12,2) not null check(amount>0),
  approved_by uuid not null references public.profiles(id),
  posted_at timestamptz not null default now()
);

alter table public.payment_postings enable row level security;
alter table public.refund_requests enable row level security;
alter table public.payment_reversals enable row level security;
revoke all on public.payment_postings,public.refund_requests,public.payment_reversals from anon;
grant select on public.payment_postings,public.payment_reversals to authenticated;
grant select on public.refund_requests to authenticated;
revoke insert on public.refund_requests from authenticated;
revoke insert on public.payment_submissions from authenticated;
revoke update,delete on public.payment_postings,public.refund_requests,public.payment_reversals from authenticated;
drop policy if exists "finance and patient read payment postings" on public.payment_postings;
create policy "finance and patient read payment postings" on public.payment_postings for select using (public.has_any_role(array['super_admin','accountant']) or public.can_access_patient(patient_id));
drop policy if exists "finance and patient read refund requests" on public.refund_requests;
create policy "finance and patient read refund requests" on public.refund_requests for select using (
  public.has_any_role(array['super_admin','accountant','receptionist']) or exists(select 1 from public.payment_postings p where p.id=payment_posting_id and public.can_access_patient(p.patient_id))
);
drop policy if exists "staff request refunds" on public.refund_requests;
create policy "staff request refunds" on public.refund_requests for insert with check (
  public.has_any_role(array['super_admin','accountant','receptionist']) and requested_by=(select id from public.profiles where auth_user_id=auth.uid() limit 1) and status='pending'
);
drop policy if exists "finance and patient read payment reversals" on public.payment_reversals;
create policy "finance and patient read payment reversals" on public.payment_reversals for select using (
  public.has_any_role(array['super_admin','accountant']) or exists(select 1 from public.payment_postings p where p.id=payment_posting_id and public.can_access_patient(p.patient_id))
);

create or replace function public.stamp_payment_submission_actor() returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor is null then raise exception 'An active staff profile is required to submit a payment.'; end if;
  if tg_op='INSERT' then
    if new.status<>'pending' then raise exception 'Payment submissions must start pending review.'; end if;
    new.submitted_by:=actor;
  elsif new.status is distinct from old.status and current_setting('onemed.reviewing_payment',true) is distinct from 'yes' then
    raise exception 'Payment status can only change through the review workflow.';
  end if;
  return new;
end;
$$;
drop trigger if exists stamp_payment_submission_actor on public.payment_submissions;
create trigger stamp_payment_submission_actor before insert or update on public.payment_submissions for each row execute function public.stamp_payment_submission_actor();

create or replace function public.submit_payment_for_approval(p_billing_id uuid,p_amount numeric,p_payment_method text,p_reference text,p_idempotency_key text) returns uuid
language plpgsql security definer set search_path=public as $$
declare invoice_row public.billing%rowtype; actor_profile uuid; saved public.payment_submissions%rowtype;
begin
  if not public.has_any_role(array['super_admin','accountant','receptionist']) then raise exception 'Payment submission access denied.'; end if;
  if p_amount<=0 or nullif(trim(p_payment_method),'') is null or nullif(trim(p_idempotency_key),'') is null then raise exception 'Amount, payment method, and idempotency key are required.'; end if;
  select id into actor_profile from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  select * into saved from public.payment_submissions where idempotency_key=trim(p_idempotency_key);
  if found then
    if saved.submitted_by<>actor_profile or saved.billing_id<>p_billing_id or saved.amount<>p_amount or saved.payment_method<>trim(p_payment_method) or saved.reference is distinct from nullif(trim(p_reference),'') then
      raise exception 'This idempotency key was already used for a different payment.';
    end if;
    return saved.id;
  end if;
  select * into invoice_row from public.billing where id=p_billing_id for update;
  if not found or p_amount>coalesce(invoice_row.balance,0) then raise exception 'Payment amount exceeds the open invoice balance.'; end if;
  insert into public.payment_submissions(billing_id,patient_id,amount,payment_method,reference,idempotency_key,status)
    values(invoice_row.id,invoice_row.patient_id,p_amount,trim(p_payment_method),nullif(trim(p_reference),''),trim(p_idempotency_key),'pending')
    on conflict(idempotency_key) do nothing;
  select * into saved from public.payment_submissions where idempotency_key=trim(p_idempotency_key);
  if saved.submitted_by<>actor_profile or saved.billing_id<>invoice_row.id or saved.patient_id<>invoice_row.patient_id or saved.amount<>p_amount or saved.payment_method<>trim(p_payment_method) or saved.reference is distinct from nullif(trim(p_reference),'') then
    raise exception 'This idempotency key was already used for a different payment.';
  end if;
  return saved.id;
end;
$$;
revoke all on function public.submit_payment_for_approval(uuid,numeric,text,text,text) from public,anon;
grant execute on function public.submit_payment_for_approval(uuid,numeric,text,text,text) to authenticated;

create or replace function public.review_payment_submission(p_payment_id uuid,p_decision text) returns void
language plpgsql security definer set search_path=public as $$
declare payment_row public.payment_submissions%rowtype; invoice_row public.billing%rowtype; actor_profile uuid; paid_total numeric(12,2);
begin
  if not public.has_any_role(array['super_admin','accountant']) then raise exception 'Only Accounts staff may review payments.'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid payment decision.'; end if;
  select id into actor_profile from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  select * into payment_row from public.payment_submissions where id=p_payment_id for update;
  if not found or payment_row.status<>'pending' then raise exception 'Payment is not awaiting review.'; end if;
  if payment_row.submitted_by=actor_profile then raise exception 'The submitter cannot review their own payment.'; end if;
  if p_decision='approved' then
    select * into invoice_row from public.billing where id=payment_row.billing_id for update;
    if not found or payment_row.amount>coalesce(invoice_row.balance,0) then raise exception 'Payment exceeds the invoice balance.'; end if;
    paid_total:=coalesce(invoice_row.paid,0)+payment_row.amount;
    perform set_config('onemed.approving_payment','yes',true);
    update public.billing set paid=paid_total,balance=greatest(0,total-paid_total),status=case when paid_total>=total then 'paid' else 'partial' end,payment_method=payment_row.payment_method where id=invoice_row.id;
    insert into public.payment_postings(payment_submission_id,billing_id,patient_id,amount,payment_method,external_reference,recorded_by)
      values(payment_row.id,payment_row.billing_id,payment_row.patient_id,payment_row.amount,payment_row.payment_method,payment_row.reference,actor_profile);
  end if;
  perform set_config('onemed.reviewing_payment','yes',true);
  update public.payment_submissions set status=p_decision,reviewed_by=actor_profile,reviewed_at=now() where id=p_payment_id;
end;
$$;
revoke all on function public.review_payment_submission(uuid,text) from public,anon;
grant execute on function public.review_payment_submission(uuid,text) to authenticated;

create or replace function public.request_billing_refund(p_payment_posting_id uuid,p_amount numeric,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare posting public.payment_postings%rowtype; actor_profile uuid; reserved numeric(12,2); request_id uuid;
begin
  if not public.has_any_role(array['super_admin','accountant','receptionist']) then raise exception 'Refund request access denied.'; end if;
  if p_amount<=0 or nullif(trim(p_reason),'') is null then raise exception 'Refund amount and reason are required.'; end if;
  select id into actor_profile from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  select * into posting from public.payment_postings where id=p_payment_posting_id for update;
  if not found then raise exception 'Payment posting not found.'; end if;
  select coalesce(sum(amount),0) into reserved from public.payment_reversals where payment_posting_id=posting.id;
  select reserved+coalesce(sum(amount),0) into reserved from public.refund_requests where payment_posting_id=posting.id and status='pending';
  if reserved+p_amount>posting.amount then raise exception 'Refund request exceeds the remaining posted payment.'; end if;
  insert into public.refund_requests(payment_posting_id,amount,reason,requested_by) values(posting.id,p_amount,trim(p_reason),actor_profile) returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.request_billing_refund(uuid,numeric,text) from public,anon;
grant execute on function public.request_billing_refund(uuid,numeric,text) to authenticated;

create or replace function public.review_billing_refund(p_refund_request_id uuid,p_decision text,p_rejection_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare request_row public.refund_requests%rowtype; posting public.payment_postings%rowtype; invoice_row public.billing%rowtype; actor_profile uuid; reversed numeric(12,2); paid_total numeric(12,2);
begin
  if not public.has_any_role(array['super_admin','accountant']) then raise exception 'Only Accounts staff may review refunds.'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid refund decision.'; end if;
  select id into actor_profile from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  select * into request_row from public.refund_requests where id=p_refund_request_id for update;
  if not found or request_row.status<>'pending' then raise exception 'Refund request is not pending review.'; end if;
  if request_row.requested_by=actor_profile then raise exception 'The requester cannot review their own refund.'; end if;
  select * into posting from public.payment_postings where id=request_row.payment_posting_id for update;
  if p_decision='approved' then
    select * into invoice_row from public.billing where id=posting.billing_id for update;
    if invoice_row.id is null then raise exception 'Refund invoice was not found.'; end if;
    select coalesce(sum(amount),0) into reversed from public.payment_reversals where payment_posting_id=posting.id;
    if reversed+request_row.amount>posting.amount then raise exception 'Approved refunds exceed the posted payment.'; end if;
    if coalesce(invoice_row.paid,0)<request_row.amount then raise exception 'Refund exceeds the invoice paid balance.'; end if;
    insert into public.payment_reversals(refund_request_id,payment_posting_id,amount,approved_by) values(request_row.id,posting.id,request_row.amount,actor_profile);
    paid_total:=invoice_row.paid-request_row.amount;
    perform set_config('onemed.approving_payment','yes',true);
    update public.billing set paid=paid_total,balance=least(total,coalesce(balance,0)+request_row.amount),status=case when paid_total<=0 then 'pending' else 'partial' end where id=invoice_row.id;
  end if;
  update public.refund_requests set status=p_decision,reviewed_by=actor_profile,reviewed_at=now(),rejection_reason=case when p_decision='rejected' then nullif(trim(p_rejection_reason),'') else null end where id=request_row.id;
end;
$$;
revoke all on function public.review_billing_refund(uuid,text,text) from public,anon;
grant execute on function public.review_billing_refund(uuid,text,text) to authenticated;

notify pgrst,'reload schema';
