begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- External notifications deliberately disclose no patient identity, result value,
-- diagnosis, result type, or escalation detail. The random acknowledgement UUID
-- is only a routing reference; users must authenticate at the app login link.
create or replace function public.notify_critical_result_recipient() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  kind text:=tg_argv[0];
  flagged_critical boolean;
  recipient uuid;
  recipient_email text;
  recipient_phone text;
  destination text;
  channel_value text;
  ack_reference uuid;
  outbound_status text;
  attempt_count integer;
  error_text text;
begin
  if tg_op='UPDATE' and ((kind='laboratory' and new.results is not distinct from old.results and new.result_status is not distinct from old.result_status and new.status is not distinct from old.status and new.responsible_clinician_id is not distinct from old.responsible_clinician_id)
    or (kind='radiology' and new.report is not distinct from old.report and new.report_status is not distinct from old.report_status and new.critical_finding is not distinct from old.critical_finding and new.responsible_clinician_id is not distinct from old.responsible_clinician_id)) then return new; end if;
  if kind='laboratory' then
    if new.result_status not in ('final','corrected') then return new; end if;
    flagged_critical:=new.result_flag='critical';
  else
    if new.report_status not in ('final','amended') then return new; end if;
    flagged_critical:=new.finding_flag='critical';
  end if;
  if not flagged_critical then return new; end if;

  recipient:=coalesce(new.responsible_clinician_id,new.doctor_id);
  if recipient is null or not exists(select 1 from public.profiles where id=recipient and status::text='active') then
    select id into recipient from public.profiles where role::text='super_admin' and status::text='active' order by created_at limit 1;
  end if;
  if recipient is null then return new; end if;

  insert into public.notifications(user_id,type,title,message,priority)
  values(recipient,case when kind='laboratory' then 'critical_lab_result' else 'critical_radiology_result' end,'Critical result requires read-back','A critical result is awaiting acknowledgement.','urgent');

  select id into ack_reference from public.result_acknowledgements where result_type=kind and result_id=new.id;
  ack_reference:=coalesce(ack_reference,new.id);
  select nullif(btrim(email),''),nullif(btrim(phone),'') into recipient_email,recipient_phone from public.profiles where id=recipient;
  if recipient_email is not null then channel_value:='email'; destination:=recipient_email;
  elsif recipient_phone is not null then channel_value:='sms'; destination:=recipient_phone;
  else channel_value:='push'; destination:='unconfigured:'||recipient::text; end if;
  outbound_status:=case when channel_value='push' then 'failed' else 'queued' end;
  attempt_count:=case when channel_value='push' then 8 else 0 end;
  error_text:=case when channel_value='push' then 'No external clinician contact is configured' else null end;
  insert into public.outbound_messages(channel,recipient,recipient_profile_id,template,payload,status,attempts,last_error)
  values(channel_value,destination,recipient,'critical_result_acknowledgement',jsonb_build_object(
    'message','A critical result is awaiting acknowledgement.',
    'reference',ack_reference
  ),outbound_status,attempt_count,error_text);
  return new;
end $$;
revoke all on function public.notify_critical_result_recipient() from public,anon,authenticated;
drop trigger if exists notify_critical_lab_result on public.lab_orders;
drop trigger if exists notify_critical_radiology_result on public.radiology_orders;
drop trigger if exists zz_notify_critical_lab_result on public.lab_orders;
drop trigger if exists zz_notify_critical_radiology_result on public.radiology_orders;
create trigger zz_notify_critical_lab_result after insert or update of results,result_status,status,responsible_clinician_id on public.lab_orders
  for each row execute function public.notify_critical_result_recipient('laboratory');
create trigger zz_notify_critical_radiology_result after insert or update of report,report_status,critical_finding,responsible_clinician_id on public.radiology_orders
  for each row execute function public.notify_critical_result_recipient('radiology');

-- Escalations retain the in-app alert and audit link. Critical outbound messages
-- contain only the generic prompt and acknowledgement reference; other severities
-- retain their existing internal queue contract.
create or replace function public.escalate_overdue_results() returns integer
language plpgsql security definer set search_path=public as $$
declare
  ack record;
  step record;
  recipient uuid;
  notification_id uuid;
  outbound_id uuid;
  changed integer:=0;
  destination text;
  destination_email text;
  destination_phone text;
  channel_value text;
  outbound_status text;
  attempt_count integer;
  error_text text;
begin
  for ack in select * from public.result_acknowledgements where status in ('unacknowledged','escalated') and coalesce(next_escalation_at,due_at)<=now() order by due_at for update skip locked limit 200 loop
    select * into step from public.result_escalation_ladder where active and step_order>ack.escalation_step order by step_order limit 1;
    if not found then continue; end if;
    recipient:=case when step.step_key='responsible_clinician' then ack.responsible_clinician_id else step.recipient_profile_id end;
    if recipient is null and step.step_key='responsible_clinician' then
      select id into recipient from public.profiles where role::text='super_admin' and status::text='active' order by created_at limit 1;
    end if;
    if recipient is null or not exists(select 1 from public.profiles where id=recipient and status::text='active') then
      update public.result_acknowledgements set next_escalation_at=now()+interval '5 minutes',updated_at=now() where id=ack.id;
      continue;
    end if;
    outbound_id:=null;
    insert into public.notifications(user_id,type,title,message,priority) values(recipient,'result_escalation','Overdue clinical result acknowledgement','A clinical result is still awaiting acknowledgement.',case when ack.severity='critical' then 'urgent' else 'high' end) returning id into notification_id;
    select nullif(btrim(email),''),nullif(btrim(phone),'') into destination_email,destination_phone from public.profiles where id=recipient;
    if ack.severity='critical' then
      if destination_email is not null then channel_value:='email'; destination:=destination_email;
      elsif destination_phone is not null then channel_value:='sms'; destination:=destination_phone;
      else channel_value:='push'; destination:='unconfigured:'||recipient::text; end if;
      outbound_status:=case when channel_value='push' then 'failed' else 'queued' end;
      attempt_count:=case when channel_value='push' then 8 else 0 end;
      error_text:=case when channel_value='push' then 'No external clinician contact is configured' else null end;
      insert into public.outbound_messages(channel,recipient,recipient_profile_id,template,payload,status,attempts,last_error)
      values(channel_value,destination,recipient,'critical_result_acknowledgement',jsonb_build_object(
        'message','A critical result is awaiting acknowledgement.',
        'reference',ack.id
      ),outbound_status,attempt_count,error_text) returning id into outbound_id;
    else
      select email into destination from public.profiles where id=recipient;
      insert into public.outbound_messages(channel,recipient,recipient_profile_id,template,payload)
      values(case when destination is null then 'push' else 'email' end,coalesce(destination,recipient::text),recipient,'critical_result_escalation',jsonb_build_object('result_type',ack.result_type,'result_id',ack.result_id,'severity',ack.severity,'step',step.step_key)) returning id into outbound_id;
    end if;
    insert into public.result_escalation_log(acknowledgement_id,step_order,recipient_profile_id,notification_id,outbound_message_id)
    values(ack.id,step.step_order,recipient,notification_id,outbound_id);
    update public.result_acknowledgements set status='escalated',escalation_step=step.step_order,current_recipient_id=recipient,escalation_at=now(),escalation_reason='Acknowledgement deadline exceeded',next_escalation_at=now()+make_interval(mins=>step.after_minutes),updated_at=now() where id=ack.id;
    changed:=changed+1;
  end loop;
  return changed;
end $$;
revoke all on function public.escalate_overdue_results() from public,anon,authenticated;
grant execute on function public.escalate_overdue_results() to service_role;

create or replace function public.get_operations_alerts()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.has_any_role(array['super_admin','it_admin','doctor','laboratory_scientist']) then raise exception 'Operations alert access denied.'; end if;
  select jsonb_build_object(
    'failed_jobs',(select count(*) from public.fhir_exchange_jobs where status='failed'),
    'unacknowledged_critical_results',(select count(*) from public.result_acknowledgements where status in ('unacknowledged','escalated') and (due_at is null or due_at<=now())),
    'failed_outbound_messages',(select count(*) from public.outbound_messages where status='failed'),
    'undelivered_critical_result_messages',(select count(*) from public.outbound_messages where template='critical_result_acknowledgement' and status<>'sent'),
    'authentication_anomalies',(select count(*) from public.account_admin_audit where outcome='failure' and created_at>=now()-interval '24 hours')+(select count(*) from public.monitoring_events where event_type='auth_anomaly' and created_at>=now()-interval '24 hours'),
    'edge_function_errors',(select count(*) from public.monitoring_events where event_type='edge_error' and created_at>=now()-interval '24 hours')
  ) into result;
  return result;
end $$;
revoke all on function public.get_operations_alerts() from public,anon;
grant execute on function public.get_operations_alerts() to authenticated;

create or replace function public.list_critical_result_delivery_status()
returns table(reference uuid,delivery_status text,attempts integer,created_at timestamptz,status_detail text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_any_role(array['super_admin']) then raise exception 'Critical notification status access denied.'; end if;
  return query
    select nullif(message.payload->>'reference','')::uuid,message.status,message.attempts,message.created_at,
      case when message.status='failed' then 'Delivery failed after retry limit'
           when message.status='sent' then 'Delivered'
           when message.status='sending' then 'Delivery in progress'
           else 'Awaiting delivery' end
    from public.outbound_messages message
    where message.template='critical_result_acknowledgement'
    order by message.created_at desc limit 50;
end $$;
revoke all on function public.list_critical_result_delivery_status() from public,anon;
grant execute on function public.list_critical_result_delivery_status() to authenticated;

-- Supabase Vault stores scheduler credentials. Dispatch jobs are registered only
-- when cron, net, and the Vault view are installed; otherwise use the documented
-- external scheduler. The key is never embedded in this migration or job SQL.
do $$
declare existing_job bigint; dispatch_sql text;
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    select jobid into existing_job from cron.job where jobname='critical-result-escalation' limit 1;
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule('critical-result-escalation','* * * * *','select public.escalate_overdue_results()');
    if exists(select 1 from pg_extension where extname='pg_net') and to_regclass('vault.decrypted_secrets') is not null then
      dispatch_sql := $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/notification-dispatch',
          headers := jsonb_build_object('Content-Type','application/json','apikey',(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'),'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_role_key')),
          body := '{}'::jsonb,
          timeout_milliseconds := 10000
        );
      $job$;
      select jobid into existing_job from cron.job where jobname='notification-dispatch' limit 1;
      if existing_job is not null then perform cron.unschedule(existing_job); end if;
      perform cron.schedule('notification-dispatch','* * * * *',dispatch_sql);
      dispatch_sql := replace(dispatch_sql,'/functions/v1/notification-dispatch','/functions/v1/integration-dispatch');
      select jobid into existing_job from cron.job where jobname='integration-dispatch' limit 1;
      if existing_job is not null then perform cron.unschedule(existing_job); end if;
      perform cron.schedule('integration-dispatch','* * * * *',dispatch_sql);
    end if;
  end if;
exception when undefined_table or undefined_function or insufficient_privilege then null;
end $$;

commit;
notify pgrst,'reload schema';
