begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

alter table public.payment_provider_transactions add column if not exists provider_reference text;
alter table public.payment_provider_transactions add column if not exists provider_transaction_id text;
alter table public.payment_provider_transactions add column if not exists provider_external_reference text;

create table if not exists public.gateway_refund_requests (
 id uuid primary key default gen_random_uuid(), payment_reversal_id uuid not null unique references public.payment_reversals(id) on delete restrict,
 connection_id uuid not null references public.integration_connections(id) on delete restrict,
 payment_provider_transaction_id uuid not null references public.payment_provider_transactions(id) on delete restrict,
 amount numeric(12,2) not null check(amount>0), currency text not null check(currency ~ '^[A-Z]{3}$'),
 refund_reference text not null, provider_refund_id text, status text not null default 'queued'
 check(status in ('queued','submitted','processing','needs_attention','failed','processed')),
 response jsonb not null default '{}'::jsonb check(jsonb_typeof(response)='object'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(connection_id,refund_reference), unique(connection_id,provider_refund_id)
);
create index if not exists gateway_refund_requests_status_idx on public.gateway_refund_requests(connection_id,status,created_at desc);
alter table public.gateway_refund_requests enable row level security;
revoke all on public.gateway_refund_requests from public,anon,authenticated;
grant select on public.gateway_refund_requests to authenticated;
grant select,insert,update on public.gateway_refund_requests to service_role;
drop policy if exists gateway_refunds_finance_read on public.gateway_refund_requests;
create policy gateway_refunds_finance_read on public.gateway_refund_requests for select to authenticated using (
 exists(select 1 from public.payment_provider_transactions t where t.id=payment_provider_transaction_id and public.has_finance_department_permission(t.patient_id,'payment.record'))
);
drop trigger if exists audit_gateway_refund_requests on public.gateway_refund_requests;
create trigger audit_gateway_refund_requests after insert or update on public.gateway_refund_requests for each row execute function public.audit_row_change();

create or replace function public.queue_gateway_refund() returns trigger language plpgsql security definer set search_path=public as $$
declare posting public.payment_postings%rowtype; gateway public.payment_provider_transactions%rowtype; refund_id uuid; refund_ref text;
begin
 select * into posting from public.payment_postings where id=new.payment_posting_id;
 select * into gateway from public.payment_provider_transactions where payment_submission_id=posting.payment_submission_id;
 if not found then return new; end if;
 refund_ref:='MCREF-'||replace(new.id::text,'-','');
 insert into public.gateway_refund_requests(payment_reversal_id,connection_id,payment_provider_transaction_id,amount,currency,refund_reference)
 values(new.id,gateway.connection_id,gateway.id,new.amount,gateway.currency,refund_ref) returning id into refund_id;
 perform public.enqueue_integration_event(gateway.connection_id,'payment.refund.create','gateway_refund',refund_id,'payment-refund:'||refund_id::text,
  jsonb_build_object('refund_id',refund_id,'refund_reference',refund_ref,'provider_reference',gateway.provider_reference,
   'provider_transaction_id',gateway.provider_transaction_id,'amount',new.amount,'currency',gateway.currency,'idempotency_key','payment-refund:'||refund_id::text));
 return new;
end $$;
drop trigger if exists queue_gateway_refund_after_approval on public.payment_reversals;
create trigger queue_gateway_refund_after_approval after insert on public.payment_reversals for each row execute function public.queue_gateway_refund();

create or replace function public.sync_gateway_outbox_response() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='delivered' and old.status is distinct from new.status then
  if new.event_type='payment.intent.create' then
   update public.payment_provider_transactions set provider_reference=nullif(new.response->>'reference',''),
    provider_transaction_id=nullif(new.response->>'id',''),provider_external_reference=nullif(new.response->>'id',''),
    updated_at=now() where id=new.aggregate_id;
  elsif new.event_type='payment.refund.create' then
   update public.gateway_refund_requests set status='submitted',provider_refund_id=nullif(new.response->>'id',''),
    response=new.response,updated_at=now() where id=new.aggregate_id and status='queued';
  end if;
 elsif new.status='dead' and old.status is distinct from new.status and new.event_type='payment.refund.create' then
  update public.gateway_refund_requests set status='failed',response=jsonb_build_object('error',left(coalesce(new.last_error,'Provider delivery failed'),500)),updated_at=now()
   where id=new.aggregate_id and status='queued';
 end if;
 return new;
end $$;
drop trigger if exists sync_gateway_outbox_response on public.integration_outbox;
create trigger sync_gateway_outbox_response after update of status on public.integration_outbox for each row execute function public.sync_gateway_outbox_response();

create or replace function public.process_payment_refund_event(p_connection_id uuid,p_event_id text,payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare inbox uuid; refund uuid; next_status text; is_gateway boolean;
begin
 if auth.role()<>'service_role' then raise exception 'service_role required'; end if;
 if p_event_id is null or length(p_event_id) not between 1 and 200 or jsonb_typeof(payload)<>'object' then raise exception 'Invalid payment refund event'; end if;
 select exists(select 1 from public.integration_connections where id=p_connection_id and integration_type='payment_gateway' and status='active') into is_gateway;
 if not is_gateway then raise exception 'Active payment gateway connection required'; end if;
 insert into public.integration_inbox(connection_id,external_event_id,event_type,payload) values(p_connection_id,p_event_id,'payment.refund.updated',payload)
 on conflict(connection_id,external_event_id) do nothing returning id into inbox;
 if inbox is null then return; end if;
 refund:=(payload->>'refund_id')::uuid; next_status:=payload->>'status';
 if next_status not in ('processing','needs_attention','failed','processed') then raise exception 'Invalid normalized refund status'; end if;
 update public.gateway_refund_requests set status=next_status,response=coalesce(payload->'response','{}'::jsonb),provider_refund_id=coalesce(nullif(payload->>'provider_refund_id',''),provider_refund_id),updated_at=now()
  where id=refund and connection_id=p_connection_id and status in ('queued','submitted','processing','needs_attention');
 if not found then raise exception 'Refund response does not match a submitted gateway refund'; end if;
 update public.integration_inbox set processed_at=now() where id=inbox;
end $$;

revoke all on function public.queue_gateway_refund(),public.sync_gateway_outbox_response(),public.process_payment_refund_event(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.process_payment_refund_event(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
