begin;
do $$ begin
 if exists(select 1 from public.gateway_refund_requests) or exists(select 1 from public.payment_provider_transactions where provider_reference is not null or provider_transaction_id is not null or provider_external_reference is not null) then
  raise exception 'Rollback refused: gateway references or refund delivery history exists; preserve processor audit records and fix forward.';
 end if;
end $$;
drop trigger if exists sync_gateway_outbox_response on public.integration_outbox;
drop trigger if exists queue_gateway_refund_after_approval on public.payment_reversals;
drop function if exists public.sync_gateway_outbox_response();
drop function if exists public.queue_gateway_refund();
drop function if exists public.process_payment_refund_event(uuid,text,jsonb);
drop table public.gateway_refund_requests;
alter table public.payment_provider_transactions drop column provider_reference,drop column provider_transaction_id,drop column provider_external_reference;
notify pgrst,'reload schema';
commit;
