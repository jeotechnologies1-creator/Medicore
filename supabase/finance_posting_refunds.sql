-- Idempotent payment posting and two-person refund review.
-- Apply after organization_permissions.sql.

insert into public.permission_catalog(permission_key,description,sensitive) values
  ('payment.approve','Approve posted payments',true),('refund.approve','Approve payment reversals',true)
on conflict(permission_key) do update set description=excluded.description,sensitive=excluded.sensitive;
insert into public.role_permission_grants(role,permission_key,scope) values
  ('accountant','payment.record','facility'),('receptionist','payment.record','facility'),
  ('accountant','payment.approve','facility'),('accountant','refund.approve','facility')
on conflict do nothing;

create or replace function public.has_finance_department_permission(target_patient_id uuid,requested_permission text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare actor_id uuid; actor_role text; target_facility uuid;
begin
  select id,role::text,facility_id into actor_id,actor_role,target_facility from public.profiles
  where auth_user_id=auth.uid() and status::text='active' limit 1;
  if actor_id is null then return false; end if;
  if actor_role='super_admin' then return true; end if;
  select coalesce(p.home_facility_id,target_facility) into target_facility from public.patients p where p.id=target_patient_id;
  if target_facility is null then return false; end if;
  return exists(select 1 from public.staff_organization_memberships m
    join public.organization_units u on u.id=m.organization_unit_id and u.status='active'
    where m.profile_id=actor_id and m.status='active' and m.starts_on<=current_date
      and (m.ends_on is null or m.ends_on>=current_date)
      and (u.facility_id=target_facility or u.facility_id is null)
      and public.has_org_permission(requested_permission,target_facility,u.id));
end;
$$;
revoke all on function public.has_finance_department_permission(uuid,text) from public,anon;
grant execute on function public.has_finance_department_permission(uuid,text) to authenticated;

drop policy if exists "department finance read billing" on public.billing;
drop policy if exists "department finance manage billing" on public.billing;
create policy "department finance read billing" on public.billing as restrictive for select to authenticated using (
  public.has_finance_department_permission(patient_id,'payment.record')
  or exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.patient_id=billing.patient_id)
);
create policy "department finance manage billing" on public.billing as restrictive for all to authenticated
  using (public.has_finance_department_permission(patient_id,'payment.record') or exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.patient_id=billing.patient_id))
  with check (public.has_finance_department_permission(patient_id,'payment.record') or exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.patient_id=billing.patient_id));
drop policy if exists "department finance read payment submissions" on public.payment_submissions;
create policy "department finance read payment submissions" on public.payment_submissions as restrictive for select to authenticated using (
  public.has_finance_department_permission(patient_id,'payment.record')
  or public.has_finance_department_permission(patient_id,'payment.approve')
  or submitted_by=(select id from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1)
);

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
create policy "finance and patient read payment postings" on public.payment_postings for select using (
  public.has_finance_department_permission(patient_id,'payment.record')
  or exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.patient_id=payment_postings.patient_id)
);
drop policy if exists "finance and patient read refund requests" on public.refund_requests;
create policy "finance and patient read refund requests" on public.refund_requests for select using (
  exists(select 1 from public.payment_postings p where p.id=payment_posting_id and public.has_finance_department_permission(p.patient_id,'payment.record'))
  or exists(select 1 from public.payment_postings p join public.profiles profile on profile.patient_id=p.patient_id where p.id=payment_posting_id and profile.auth_user_id=auth.uid())
);
drop policy if exists "staff request refunds" on public.refund_requests;
create policy "staff request refunds" on public.refund_requests for insert with check (
  public.has_finance_department_permission((select p.patient_id from public.payment_postings p where p.id=payment_posting_id),'payment.record') and requested_by=(select id from public.profiles where auth_user_id=auth.uid() limit 1) and status='pending'
);
drop policy if exists "finance and patient read payment reversals" on public.payment_reversals;
create policy "finance and patient read payment reversals" on public.payment_reversals for select using (
  exists(select 1 from public.payment_postings p where p.id=payment_posting_id and public.has_finance_department_permission(p.patient_id,'payment.record'))
  or exists(select 1 from public.payment_postings p join public.profiles profile on profile.patient_id=p.patient_id where p.id=payment_posting_id and profile.auth_user_id=auth.uid())
);

create or replace function public.stamp_payment_submission_actor() returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
  if current_setting('onemed.integration_writer',true)='yes' then
    if tg_op='INSERT' and new.status='pending' and new.submitted_by is not null then return new; end if;
    raise exception 'Invalid integration payment submission.';
  end if;
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
declare invoice_row public.billing%rowtype; actor_profile uuid; target_patient_id uuid; saved public.payment_submissions%rowtype;
begin
  if not public.has_any_role(array['super_admin','accountant','receptionist']) then raise exception 'Payment submission access denied.'; end if;
  if p_amount<=0 or nullif(trim(p_payment_method),'') is null or nullif(trim(p_idempotency_key),'') is null then raise exception 'Amount, payment method, and idempotency key are required.'; end if;
  select id into actor_profile from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  select patient_id into target_patient_id from public.billing where id=p_billing_id;
  if not found or not public.has_finance_department_permission(target_patient_id,'payment.record') then raise exception 'Payment submission facility access denied.'; end if;
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
  if not public.has_finance_department_permission(payment_row.patient_id,'payment.approve') then raise exception 'Payment approval facility access denied.'; end if;
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
  if not public.has_finance_department_permission(posting.patient_id,'payment.record') then raise exception 'Refund request facility access denied.'; end if;
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
  if not found or not public.has_finance_department_permission(posting.patient_id,'refund.approve') then raise exception 'Refund approval facility access denied.'; end if;
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
