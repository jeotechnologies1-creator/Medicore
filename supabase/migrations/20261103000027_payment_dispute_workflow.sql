-- Payment dispute intake, response tracking, and configurable provider alerts.
-- This is additive: existing checkout, payment, and refund flows are untouched.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create table if not exists public.payment_dispute_thresholds (
  connection_id uuid primary key references public.integration_connections(id) on delete restrict,
  window_days integer not null default 30 check(window_days between 1 and 90),
  warning_count integer check(warning_count is null or warning_count > 0),
  critical_count integer check(critical_count is null or critical_count > 0),
  warning_rate numeric(7,4) check(warning_rate is null or warning_rate between 0 and 100),
  critical_rate numeric(7,4) check(critical_rate is null or critical_rate between 0 and 100),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  check(warning_count is not null or critical_count is not null or warning_rate is not null or critical_rate is not null),
  check(warning_count is null or critical_count is null or warning_count <= critical_count),
  check(warning_rate is null or critical_rate is null or warning_rate <= critical_rate)
);

create table if not exists public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.integration_connections(id) on delete restrict,
  transaction_id uuid not null references public.payment_provider_transactions(id) on delete restrict,
  external_dispute_id text not null,
  amount numeric(12,2) not null check(amount > 0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  reason text,
  response_due_at timestamptz,
  status text not null default 'open' check(status in ('open','gathering_evidence','ready_to_submit','submitted','won','lost','closed')),
  response_notes text,
  evidence_checklist jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence_checklist)='array'),
  submitted_at timestamptz,
  outcome_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id,external_dispute_id),
  unique(transaction_id,external_dispute_id)
);
create index if not exists payment_disputes_open_idx on public.payment_disputes(status,response_due_at) where status in ('open','gathering_evidence','ready_to_submit');
create index if not exists payment_disputes_window_idx on public.payment_disputes(connection_id,created_at);

create table if not exists public.payment_dispute_alerts (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.integration_connections(id) on delete restrict,
  alert_level text not null check(alert_level in ('warning','critical','configuration_required')),
  window_start timestamptz not null,
  dispute_count integer not null check(dispute_count >= 0),
  settled_count integer not null check(settled_count >= 0),
  dispute_rate numeric(7,4),
  message text not null,
  acknowledged_by uuid references public.profiles(id),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique(connection_id,alert_level,window_start)
);

create table if not exists public.payment_dispute_history (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.payment_disputes(id) on delete restrict,
  event_type text not null check(event_type in ('opened','provider_update','response_updated')),
  old_status text,
  new_status text not null,
  notes text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists payment_dispute_history_case_idx on public.payment_dispute_history(dispute_id,created_at);

alter table public.payment_dispute_thresholds enable row level security;
alter table public.payment_disputes enable row level security;
alter table public.payment_dispute_alerts enable row level security;
alter table public.payment_dispute_history enable row level security;
revoke all on public.payment_dispute_thresholds,public.payment_disputes,public.payment_dispute_alerts,public.payment_dispute_history from anon,authenticated;
grant select on public.payment_dispute_thresholds,public.payment_disputes,public.payment_dispute_alerts,public.payment_dispute_history to authenticated;
grant all on public.payment_dispute_thresholds,public.payment_disputes,public.payment_dispute_alerts,public.payment_dispute_history to service_role;

drop policy if exists "finance reads dispute thresholds" on public.payment_dispute_thresholds;
create policy "finance reads dispute thresholds" on public.payment_dispute_thresholds for select to authenticated using (
  exists(select 1 from public.integration_connections c where c.id=connection_id and (public.has_any_role(array['super_admin']) or public.has_org_permission('integration.manage',c.facility_id,null)))
);
drop policy if exists "finance reads payment disputes" on public.payment_disputes;
create policy "finance reads payment disputes" on public.payment_disputes for select to authenticated using (
  exists(select 1 from public.payment_provider_transactions t where t.id=transaction_id and (public.has_finance_department_permission(t.patient_id,'payment.record') or public.has_finance_department_permission(t.patient_id,'payment.approve')))
);
drop policy if exists "finance reads dispute alerts" on public.payment_dispute_alerts;
create policy "finance reads dispute alerts" on public.payment_dispute_alerts for select to authenticated using (
  exists(select 1 from public.integration_connections c where c.id=connection_id and (public.has_any_role(array['super_admin']) or public.has_org_permission('integration.manage',c.facility_id,null)))
  or exists(select 1 from public.payment_provider_transactions t where t.connection_id=payment_dispute_alerts.connection_id and public.has_finance_department_permission(t.patient_id,'payment.approve'))
);
drop policy if exists "finance reads dispute history" on public.payment_dispute_history;
create policy "finance reads dispute history" on public.payment_dispute_history for select to authenticated using (
  exists(select 1 from public.payment_disputes d join public.payment_provider_transactions t on t.id=d.transaction_id where d.id=dispute_id and (public.has_finance_department_permission(t.patient_id,'payment.record') or public.has_finance_department_permission(t.patient_id,'payment.approve')))
);

create or replace function public.audit_payment_dispute_change() returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  insert into public.payment_dispute_history(dispute_id,event_type,old_status,new_status,notes,actor_id)
  values(new.id,case when tg_op='INSERT' then 'opened' when current_setting('onemed.dispute_webhook',true)='yes' then 'provider_update' else 'response_updated' end,
    case when tg_op='INSERT' then null else old.status end,new.status,new.response_notes,actor);
  return new;
end $$;
drop trigger if exists audit_payment_dispute_change on public.payment_disputes;
create trigger audit_payment_dispute_change after insert or update on public.payment_disputes for each row execute function public.audit_payment_dispute_change();
revoke all on function public.audit_payment_dispute_change() from public,anon,authenticated;

create or replace function public.configure_payment_dispute_thresholds(
  p_connection_id uuid, p_window_days integer, p_warning_count integer default null,
  p_critical_count integer default null, p_warning_rate numeric default null, p_critical_rate numeric default null
) returns void language plpgsql security definer set search_path=public as $$
declare actor uuid; facility uuid;
begin
  if auth.uid() is null then raise exception 'Authenticated staff required'; end if;
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  select facility_id into facility from public.integration_connections where id=p_connection_id and integration_type='payment_gateway';
  if facility is null or not (public.has_any_role(array['super_admin']) or public.has_org_permission('integration.manage',facility,null)) then raise exception 'Payment integration management permission required'; end if;
  if p_window_days not between 1 and 90 or (p_warning_count is null and p_critical_count is null and p_warning_rate is null and p_critical_rate is null)
    or (p_warning_count is not null and p_critical_count is not null and p_warning_count>p_critical_count)
    or (p_warning_rate is not null and p_critical_rate is not null and p_warning_rate>p_critical_rate)
    or p_warning_rate not between 0 and 100 or p_critical_rate not between 0 and 100 then
    raise exception 'Set a 1-90 day window and valid warning/critical thresholds';
  end if;
  insert into public.payment_dispute_thresholds(connection_id,window_days,warning_count,critical_count,warning_rate,critical_rate,updated_by)
  values(p_connection_id,p_window_days,p_warning_count,p_critical_count,p_warning_rate,p_critical_rate,actor)
  on conflict(connection_id) do update set window_days=excluded.window_days,warning_count=excluded.warning_count,critical_count=excluded.critical_count,
    warning_rate=excluded.warning_rate,critical_rate=excluded.critical_rate,updated_by=excluded.updated_by,updated_at=now();
end $$;

create or replace function public.update_payment_dispute_response(
  p_dispute_id uuid, p_status text, p_response_notes text, p_evidence_checklist jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare dispute public.payment_disputes%rowtype; actor uuid; patient uuid;
begin
  if auth.uid() is null or p_status not in ('gathering_evidence','ready_to_submit','submitted','won','lost','closed') then raise exception 'Invalid dispute response update'; end if;
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  select d.* into dispute from public.payment_disputes d where d.id=p_dispute_id for update;
  select patient_id into patient from public.payment_provider_transactions where id=dispute.transaction_id;
  if not found or not public.has_finance_department_permission(patient,'payment.approve') then raise exception 'Finance dispute response permission required'; end if;
  if dispute.status in ('won','lost','closed') or p_status='open' or jsonb_typeof(coalesce(p_evidence_checklist,'[]'::jsonb))<>'array' then raise exception 'Invalid or terminal dispute transition'; end if;
  if p_status in ('ready_to_submit','submitted') and length(trim(coalesce(p_response_notes,'')))<10 then raise exception 'Document the response before marking it ready or submitted'; end if;
  update public.payment_disputes set status=p_status,response_notes=left(trim(coalesce(p_response_notes,'')),10000),
    evidence_checklist=p_evidence_checklist, submitted_at=case when p_status='submitted' then coalesce(submitted_at,now()) else submitted_at end,
    outcome_at=case when p_status in ('won','lost','closed') then now() else outcome_at end,updated_at=now() where id=p_dispute_id;
end $$;

create or replace function public.acknowledge_payment_dispute_alert(p_alert_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare facility uuid; actor uuid;
begin
  select c.facility_id into facility from public.payment_dispute_alerts a join public.integration_connections c on c.id=a.connection_id where a.id=p_alert_id;
  if facility is null or not (public.has_any_role(array['super_admin']) or public.has_org_permission('integration.manage',facility,null)
    or exists(select 1 from public.payment_provider_transactions t where t.connection_id=(select connection_id from public.payment_dispute_alerts where id=p_alert_id) and public.has_finance_department_permission(t.patient_id,'payment.approve'))) then raise exception 'Payment alert acknowledgement permission required'; end if;
  select id into actor from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1;
  update public.payment_dispute_alerts set acknowledged_by=actor,acknowledged_at=now() where id=p_alert_id and acknowledged_at is null;
end $$;

create or replace function public.process_payment_dispute_event(p_connection_id uuid,p_event_id text,p_event_type text,payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare connection public.integration_connections%rowtype; inbox uuid; intent public.payment_provider_transactions%rowtype; dispute public.payment_disputes%rowtype;
  ext_id text; event_amount numeric; due_at timestamptz; cfg public.payment_dispute_thresholds%rowtype; n_disputes integer; n_settled integer;
  rate numeric(7,4); level text; period_start timestamptz;
begin
  if auth.role()<>'service_role' then raise exception 'service_role required'; end if;
  if p_event_id is null or length(p_event_id) not between 1 and 200 or p_event_type not in ('payment.dispute.opened','payment.dispute.updated','payment.dispute.closed') or jsonb_typeof(payload)<>'object' then raise exception 'Invalid dispute event'; end if;
  select * into connection from public.integration_connections where id=p_connection_id and integration_type='payment_gateway' and status='active';
  if not found then raise exception 'Active payment gateway connection not found'; end if;
  perform set_config('onemed.dispute_webhook','yes',true);
  insert into public.integration_inbox(connection_id,external_event_id,event_type,payload) values(p_connection_id,p_event_id,p_event_type,payload) on conflict(connection_id,external_event_id) do nothing returning id into inbox;
  if inbox is null then return; end if;
  ext_id:=left(trim(payload->>'dispute_id'),200);
  if ext_id is null or ext_id='' then raise exception 'Dispute event requires dispute_id'; end if;
  if p_event_type='payment.dispute.opened' then
    select * into intent from public.payment_provider_transactions where id=(payload->>'transaction_id')::uuid and connection_id=p_connection_id for update;
    event_amount:=coalesce((payload->>'amount')::numeric,intent.amount);
    if not found or event_amount<=0 or event_amount>intent.amount then raise exception 'Dispute transaction or amount is invalid'; end if;
    due_at:=nullif(payload->>'response_due_at','')::timestamptz;
    insert into public.payment_disputes(connection_id,transaction_id,external_dispute_id,amount,currency,reason,response_due_at)
    values(p_connection_id,intent.id,ext_id,event_amount,intent.currency,left(payload->>'reason',500),due_at)
    on conflict(connection_id,external_dispute_id) do update set reason=excluded.reason,response_due_at=coalesce(excluded.response_due_at,payment_disputes.response_due_at),updated_at=now()
    returning * into dispute;
  else
    select * into dispute from public.payment_disputes where connection_id=p_connection_id and external_dispute_id=ext_id for update;
    if not found then raise exception 'Dispute was not previously opened'; end if;
    if p_event_type='payment.dispute.closed' then update public.payment_disputes set status='closed',outcome_at=now(),updated_at=now() where id=dispute.id and status not in ('won','lost','closed');
    else update public.payment_disputes set reason=coalesce(left(payload->>'reason',500),reason),response_due_at=coalesce(nullif(payload->>'response_due_at','')::timestamptz,response_due_at),updated_at=now() where id=dispute.id;
    end if;
  end if;
  select * into cfg from public.payment_dispute_thresholds where connection_id=p_connection_id;
  period_start:=now()-make_interval(days=>coalesce(cfg.window_days,30));
  if not found then
    insert into public.payment_dispute_alerts(connection_id,alert_level,window_start,dispute_count,settled_count,message)
    values(p_connection_id,'configuration_required',date_trunc('day',now()),1,0,'Configure provider dispute alert thresholds before relying on threshold monitoring.') on conflict do nothing;
  else
    select count(*) into n_disputes from public.payment_disputes where connection_id=p_connection_id and created_at>=period_start;
    select count(*) into n_settled from public.payment_provider_transactions where connection_id=p_connection_id and status='posted' and created_at>=period_start;
    rate:=case when n_settled>0 then round((n_disputes::numeric/n_settled)*100,4) else null end;
    if (cfg.critical_count is not null and n_disputes>=cfg.critical_count) or (cfg.critical_rate is not null and rate>=cfg.critical_rate) then level:='critical';
    elsif (cfg.warning_count is not null and n_disputes>=cfg.warning_count) or (cfg.warning_rate is not null and rate>=cfg.warning_rate) then level:='warning'; else level:=null; end if;
    if level is not null then
      insert into public.payment_dispute_alerts(connection_id,alert_level,window_start,dispute_count,settled_count,dispute_rate,message)
      values(p_connection_id,level,date_trunc('day',now()),n_disputes,n_settled,rate,format('%s dispute threshold reached: %s disputes from %s posted transactions%s in the last %s days.',level,n_disputes,n_settled,case when rate is null then '' else ' ('||round(rate,2)::text||'%)' end,cfg.window_days)) on conflict do nothing;
    end if;
  end if;
  update public.integration_inbox set processed_at=now() where id=inbox;
end $$;

revoke all on function public.configure_payment_dispute_thresholds(uuid,integer,integer,integer,numeric,numeric),public.update_payment_dispute_response(uuid,text,text,jsonb),public.acknowledge_payment_dispute_alert(uuid),public.process_payment_dispute_event(uuid,text,text,jsonb) from public,anon;
grant execute on function public.configure_payment_dispute_thresholds(uuid,integer,integer,integer,numeric,numeric),public.update_payment_dispute_response(uuid,text,text,jsonb),public.acknowledge_payment_dispute_alert(uuid) to authenticated;
grant execute on function public.process_payment_dispute_event(uuid,text,text,jsonb) to service_role;

commit;
notify pgrst,'reload schema';
