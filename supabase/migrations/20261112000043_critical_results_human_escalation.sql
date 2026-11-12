begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Approved reference ranges are intentionally empty until reviewed clinical
-- data is supplied by the institution.
create table if not exists public.reference_ranges (
  id uuid primary key default gen_random_uuid(),
  code_system text not null,
  test_code text not null,
  sex text not null default 'any' check(sex in ('any','female','male','unknown')),
  age_min_days integer,
  age_max_days integer,
  low numeric,
  high numeric,
  unit text not null,
  critical_low numeric,
  critical_high numeric,
  approved boolean not null default false,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  check(age_min_days is null or age_min_days>=0),
  check(age_max_days is null or age_max_days>=0),
  check(age_min_days is null or age_max_days is null or age_max_days>=age_min_days),
  check(low is null or high is null or low<=high),
  check(num_nonnulls(low,high,critical_low,critical_high)>0),
  check(length(btrim(unit))>0),
  check(not approved or (approved_by is not null and approved_at is not null)),
  foreign key(code_system,test_code) references public.concepts(system,code) on update cascade on delete restrict
);
create index if not exists reference_ranges_lookup_idx on public.reference_ranges(code_system,test_code,sex,age_min_days,age_max_days) where approved;

create table if not exists public.result_ack_deadlines (
  severity text primary key check(severity in ('critical','urgent','routine')),
  deadline_minutes integer not null check(deadline_minutes between 1 and 10080),
  updated_at timestamptz not null default now()
);
insert into public.result_ack_deadlines(severity,deadline_minutes) values ('critical',30),('urgent',240),('routine',1440)
on conflict(severity) do nothing;

create table if not exists public.result_escalation_ladder (
  step_order smallint primary key check(step_order between 1 and 4),
  step_key text not null unique check(step_key in ('responsible_clinician','department_lead','on_call','medical_director')),
  after_minutes integer not null check(after_minutes between 1 and 10080),
  recipient_profile_id uuid references public.profiles(id) on delete restrict,
  active boolean not null default true
);
insert into public.result_escalation_ladder(step_order,step_key,after_minutes) values
 (1,'responsible_clinician',30),(2,'department_lead',60),(3,'on_call',120),(4,'medical_director',240)
on conflict(step_order) do nothing;

alter table public.reference_ranges enable row level security;
alter table public.result_ack_deadlines enable row level security;
alter table public.result_escalation_ladder enable row level security;
revoke all on public.reference_ranges,public.result_ack_deadlines,public.result_escalation_ladder from public,anon,authenticated;
grant select,insert,update,delete on public.reference_ranges,public.result_ack_deadlines,public.result_escalation_ladder to service_role;

alter table public.result_acknowledgements add column if not exists severity text not null default 'routine' check(severity in ('critical','urgent','routine'));
alter table public.result_acknowledgements add column if not exists escalation_step smallint not null default 0;
alter table public.result_acknowledgements add column if not exists next_escalation_at timestamptz;
alter table public.result_acknowledgements add column if not exists acknowledgement_method text;
alter table public.result_acknowledgements add column if not exists read_back_confirmed boolean not null default false;
alter table public.result_acknowledgements add column if not exists read_back_notes text;
alter table public.result_acknowledgements add column if not exists current_recipient_id uuid references public.profiles(id) on delete set null;
alter table public.lab_orders add column if not exists result_flag text not null default 'unclassified' check(result_flag in ('normal','abnormal','critical','unclassified'));
alter table public.lab_orders add column if not exists result_severity text not null default 'routine' check(result_severity in ('critical','urgent','routine'));
alter table public.radiology_orders add column if not exists finding_flag text not null default 'unclassified' check(finding_flag in ('normal','abnormal','critical','unclassified'));
alter table public.radiology_orders add column if not exists result_severity text not null default 'routine' check(result_severity in ('critical','urgent','routine'));
alter table public.radiology_orders add column if not exists critical_finding boolean not null default false;

create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check(channel in ('sms','email','push')),
  recipient text not null,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check(status in ('queued','sending','sent','failed')),
  attempts integer not null default 0 check(attempts>=0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists outbound_messages_queue_idx on public.outbound_messages(status,next_attempt_at,created_at);
alter table public.outbound_messages enable row level security;
revoke all on public.outbound_messages from public,anon,authenticated;
grant select,insert,update on public.outbound_messages to service_role;

create table if not exists public.result_escalation_log (
  id bigint generated always as identity primary key,
  acknowledgement_id uuid not null references public.result_acknowledgements(id) on delete restrict,
  step_order smallint not null,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  notification_id uuid references public.notifications(id) on delete set null,
  outbound_message_id uuid references public.outbound_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(acknowledgement_id,step_order)
);
alter table public.result_escalation_log enable row level security;
revoke all on public.result_escalation_log from public,anon,authenticated;
grant select,insert on public.result_escalation_log to service_role;
grant usage,select on sequence public.result_escalation_log_id_seq to service_role;

-- The trigger computes against NEW directly to avoid a recursive UPDATE.
create or replace function public.compute_lab_result_flags_trigger() returns trigger
language plpgsql security definer set search_path=public as $$
declare item jsonb; value_num numeric; rs record; age_days integer; sex_value text; system_code text; concept_code text; flag text; matching_ranges integer; values_out jsonb:='[]'::jsonb; overall text:='normal';
begin
  if tg_op='UPDATE' and new.results is not distinct from old.results and new.result_flag is not distinct from old.result_flag and new.result_severity is not distinct from old.result_severity
    and new.patient_id is not distinct from old.patient_id and new.code_system is not distinct from old.code_system and new.code is not distinct from old.code
    and new.result_date is not distinct from old.result_date and new.priority is not distinct from old.priority and new.status is not distinct from old.status then return new; end if;
  select coalesce(new.result_date,current_date)-date_of_birth,case lower(gender) when 'female' then 'female' when 'male' then 'male' else 'unknown' end into age_days,sex_value from public.patients where id=new.patient_id;
  if jsonb_typeof(new.results->'values')<>'array' then
    new.result_flag:='unclassified'; new.result_severity:=case when new.priority='urgent' then 'urgent' else 'routine' end;
    if new.status='critical' then new.status:=case when new.result_status in ('final','corrected') then 'completed' else 'processing' end; end if;
    return new;
  end if;
  for item in select value from jsonb_array_elements(new.results->'values') loop
    system_code:=coalesce(item->>'code_system',new.code_system); concept_code:=coalesce(item->>'code',new.code);
    value_num:=case when coalesce(item->>'value','') ~ '^-?[0-9]+(\.[0-9]+)?$' then (item->>'value')::numeric else null end; flag:='unclassified';
    if value_num is not null and system_code is not null and concept_code is not null then
      select count(*) into matching_ranges from public.reference_ranges r where r.code_system=system_code and r.test_code=concept_code and r.approved
        and (r.sex='any' or r.sex=coalesce(sex_value,'unknown')) and (r.age_min_days is null or age_days>=r.age_min_days) and (r.age_max_days is null or age_days<=r.age_max_days)
        and lower(r.unit)=lower(coalesce(item->>'unit',''));
      if matching_ranges=1 then
        select * into rs from public.reference_ranges r where r.code_system=system_code and r.test_code=concept_code and r.approved
          and (r.sex='any' or r.sex=coalesce(sex_value,'unknown')) and (r.age_min_days is null or age_days>=r.age_min_days) and (r.age_max_days is null or age_days<=r.age_max_days)
          and lower(r.unit)=lower(coalesce(item->>'unit','')) limit 1;
        flag:=case when (rs.critical_low is not null and value_num<=rs.critical_low) or (rs.critical_high is not null and value_num>=rs.critical_high) then 'critical' when (rs.low is not null and value_num<rs.low) or (rs.high is not null and value_num>rs.high) then 'abnormal' else 'normal' end;
      end if;
    end if;
    values_out:=values_out||jsonb_build_array((item-'flag')||jsonb_build_object('flag',flag));
    if flag='critical' then overall:='critical'; elsif flag='abnormal' and overall<>'critical' then overall:='abnormal'; elsif flag='unclassified' and overall='normal' then overall:='unclassified'; end if;
  end loop;
  new.results:=jsonb_set(coalesce(new.results,'{}'::jsonb),'{values}',values_out,true);
  new.result_flag:=overall; new.result_severity:=case when overall='critical' then 'critical' when new.priority='urgent' then 'urgent' else 'routine' end;
  if overall='critical' then new.status:='critical'; elsif new.status='critical' then new.status:=case when new.result_status in ('final','corrected') then 'completed' else 'processing' end; end if;
  return new;
end $$;
drop trigger if exists compute_lab_result_flags on public.lab_orders;
create trigger compute_lab_result_flags before insert or update of results,result_flag,result_severity,patient_id,code_system,code,result_date,priority,status on public.lab_orders for each row execute function public.compute_lab_result_flags_trigger();

create or replace function public.compute_radiology_finding_flag_trigger() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  -- Radiology findings are clinician-interpreted reports. Ignore client flags;
  -- only the assigned radiologist may explicitly mark a finalized report critical.
  if tg_op='UPDATE' and new.report is not distinct from old.report and new.report_status is not distinct from old.report_status and new.critical_finding is not distinct from old.critical_finding and new.finding_flag is not distinct from old.finding_flag and new.result_severity is not distinct from old.result_severity then return new; end if;
  if new.critical_finding and auth.uid() is not null and new.radiologist_id is distinct from (select id from public.profiles where auth_user_id=auth.uid() and status::text='active' limit 1) then
    raise exception 'Only the assigned active radiologist may mark a critical finding.';
  end if;
  new.finding_flag:=case when new.report_status in ('final','amended') and new.critical_finding then 'critical'
    when new.report_status in ('final','amended') and nullif(btrim(new.report),'') is not null then 'abnormal' else 'unclassified' end;
  new.result_severity:=case when new.finding_flag='critical' then 'critical' when new.priority='urgent' then 'urgent' else 'routine' end;
  return new;
end $$;
drop trigger if exists compute_radiology_finding_flag on public.radiology_orders;
create trigger compute_radiology_finding_flag before insert or update of report,report_status,status,critical_finding,finding_flag,result_severity on public.radiology_orders for each row execute function public.compute_radiology_finding_flag_trigger();

-- Immediate critical result delivery is derived only from server-owned flags.
create or replace function public.notify_critical_result_recipient() returns trigger
language plpgsql security definer set search_path=public as $$
declare kind text:=tg_argv[0]; flagged_critical boolean; recipient uuid; target_address text; outbound_id uuid;
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
  values(recipient,case when kind='laboratory' then 'critical_lab_result' else 'critical_radiology_result' end,'Critical result requires read-back',format('A critical %s result (%s) requires acknowledgement and read-back.',kind,new.id),'urgent');
  select email into target_address from public.profiles where id=recipient;
  insert into public.outbound_messages(channel,recipient,recipient_profile_id,template,payload)
  values(case when target_address is null then 'push' else 'email' end,coalesce(target_address,recipient::text),recipient,'critical_result_readback',jsonb_build_object('result_type',kind,'result_id',new.id,'patient_id',new.patient_id)) returning id into outbound_id;
  return new;
end $$;
revoke all on function public.notify_critical_result_recipient() from public,anon,authenticated;
drop trigger if exists notify_critical_lab_result on public.lab_orders;
create trigger notify_critical_lab_result after insert or update of results,result_status,status,responsible_clinician_id on public.lab_orders for each row execute function public.notify_critical_result_recipient('laboratory');
drop trigger if exists notify_critical_radiology_result on public.radiology_orders;
create trigger notify_critical_radiology_result after insert or update of report,report_status,critical_finding,responsible_clinician_id on public.radiology_orders for each row execute function public.notify_critical_result_recipient('radiology');

create or replace function public.claim_outbound_messages(p_limit integer default 25)
returns setof public.outbound_messages language plpgsql security definer set search_path=public as $$
begin
  if p_limit not between 1 and 100 then raise exception 'Invalid message batch size'; end if;
  return query with picked as (
    select id from public.outbound_messages where ((status in ('queued','failed') and next_attempt_at<=now()) or (status='sending' and lease_expires_at<now())) and attempts<8
    order by created_at for update skip locked limit p_limit
  ) update public.outbound_messages m set status='sending',attempts=m.attempts+1,lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes',last_error=null
    from picked where m.id=picked.id returning m.*;
end $$;
create or replace function public.complete_outbound_message(p_id uuid,p_lease uuid,p_ok boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.outbound_messages set status=case when p_ok then 'sent' else case when attempts>=8 then 'failed' else 'queued' end end,
    sent_at=case when p_ok then now() else null end,lease_token=null,lease_expires_at=null,last_error=case when p_ok then null else left(coalesce(p_error,'Delivery failed'),500) end,
    next_attempt_at=case when p_ok then next_attempt_at else now()+make_interval(secs=>least(3600,30*(2^least(attempts,7))::integer)) end
  where id=p_id and status='sending' and lease_token=p_lease;
  return found;
end $$;
revoke all on function public.claim_outbound_messages(integer) from public,anon,authenticated;
revoke all on function public.complete_outbound_message(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_outbound_messages(integer),public.complete_outbound_message(uuid,uuid,boolean,text) to service_role;

create or replace function public.queue_result_acknowledgement() returns trigger
language plpgsql security definer set search_path=public as $$
declare kind text:=tg_argv[0]; final_result boolean; severity_value text; recipient uuid; deadline integer;
begin
  final_result:=case when kind='laboratory' then new.result_status in ('final','corrected') or new.status='completed' else new.report_status in ('final','amended') or new.status='reported' end;
  if not final_result then return new; end if;
  severity_value:=new.result_severity; recipient:=coalesce(new.responsible_clinician_id,new.doctor_id);
  select deadline_minutes into deadline from public.result_ack_deadlines where severity=severity_value;
  insert into public.result_acknowledgements(result_type,result_id,patient_id,responsible_clinician_id,current_recipient_id,severity,due_at,next_escalation_at,status)
  values(kind,new.id,new.patient_id,recipient,recipient,severity_value,now()+make_interval(mins=>coalesce(deadline,1440)),now()+make_interval(mins=>coalesce(deadline,1440)),'unacknowledged')
  on conflict(result_type,result_id) do update set responsible_clinician_id=coalesce(excluded.responsible_clinician_id,result_acknowledgements.responsible_clinician_id),
    current_recipient_id=coalesce(excluded.current_recipient_id,result_acknowledgements.current_recipient_id),severity=excluded.severity,due_at=excluded.due_at,next_escalation_at=excluded.next_escalation_at,
    status='unacknowledged',acknowledged_at=null,acknowledged_by=null,acknowledgement_method=null,read_back_confirmed=false,read_back_notes=null,escalation_step=0,escalation_at=null,escalation_reason=null,updated_at=now();
  return new;
end $$;
drop trigger if exists queue_lab_result_acknowledgement on public.lab_orders;
create trigger queue_lab_result_acknowledgement after insert or update of status,result_status,responsible_clinician_id,results on public.lab_orders for each row execute function public.queue_result_acknowledgement('laboratory');
drop trigger if exists queue_radiology_result_acknowledgement on public.radiology_orders;
create trigger queue_radiology_result_acknowledgement after insert or update of status,report_status,responsible_clinician_id,report,critical_finding on public.radiology_orders for each row execute function public.queue_result_acknowledgement('radiology');

create or replace function public.enforce_result_readback_acknowledgement() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='acknowledged' and old.status is distinct from 'acknowledged' then
    if new.acknowledged_by is null or new.acknowledged_at is null or nullif(btrim(new.acknowledgement_method),'') is null then raise exception 'Acknowledgement requires who, when, and how.'; end if;
    if new.severity='critical' and (not new.read_back_confirmed or nullif(btrim(new.read_back_notes),'') is null) then raise exception 'Critical results require documented read-back confirmation.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists enforce_result_readback_acknowledgement on public.result_acknowledgements;
create trigger enforce_result_readback_acknowledgement before update on public.result_acknowledgements for each row execute function public.enforce_result_readback_acknowledgement();

create or replace function public.escalate_overdue_results() returns integer
language plpgsql security definer set search_path=public as $$
declare ack record; step record; recipient uuid; notification_id uuid; outbound_id uuid; changed integer:=0; destination text;
begin
  for ack in select * from public.result_acknowledgements where status in ('unacknowledged','escalated') and coalesce(next_escalation_at,due_at)<=now() order by due_at for update skip locked limit 200 loop
    select * into step from public.result_escalation_ladder where active and step_order>ack.escalation_step order by step_order limit 1;
    if not found then continue; end if;
    recipient:=case when step.step_key='responsible_clinician' then ack.responsible_clinician_id else step.recipient_profile_id end;
    if recipient is null and step.step_key='responsible_clinician' then
      select id into recipient from public.profiles where role::text='super_admin' and status::text='active' order by created_at limit 1;
    end if;
    if recipient is null or not exists(select 1 from public.profiles where id=recipient and status::text='active') then
      -- Keep unresolved recipient configuration visible and retry on next cron pass.
      update public.result_acknowledgements set next_escalation_at=now()+interval '5 minutes',updated_at=now() where id=ack.id;
      continue;
    end if;
    outbound_id:=null;
    insert into public.notifications(user_id,type,title,message,priority) values(recipient,'result_escalation','Overdue clinical result acknowledgement',format('%s result %s remains unacknowledged (step %s).',ack.result_type,ack.result_id,step.step_key),case when ack.severity='critical' then 'urgent' else 'high' end) returning id into notification_id;
    select email into destination from public.profiles where id=recipient;
    insert into public.outbound_messages(channel,recipient,recipient_profile_id,template,payload)
    values(case when destination is null then 'push' else 'email' end,coalesce(destination,recipient::text),recipient,'critical_result_escalation',jsonb_build_object('result_type',ack.result_type,'result_id',ack.result_id,'severity',ack.severity,'step',step.step_key)) returning id into outbound_id;
    insert into public.result_escalation_log(acknowledgement_id,step_order,recipient_profile_id,notification_id,outbound_message_id) values(ack.id,step.step_order,recipient,notification_id,outbound_id);
    update public.result_acknowledgements set status='escalated',escalation_step=step.step_order,current_recipient_id=recipient,escalation_at=now(),escalation_reason='Acknowledgement deadline exceeded',next_escalation_at=now()+make_interval(mins=>step.after_minutes),updated_at=now() where id=ack.id;
    changed:=changed+1;
  end loop;
  return changed;
end $$;
revoke all on function public.escalate_overdue_results() from public,anon,authenticated;
grant execute on function public.escalate_overdue_results() to service_role;

do $$ declare existing_job bigint; begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    select jobid into existing_job from cron.job where jobname='critical-result-escalation' limit 1;
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule('critical-result-escalation','* * * * *','select public.escalate_overdue_results()');
  end if;
exception when undefined_table or undefined_function or insufficient_privilege then null;
end $$;

commit;
notify pgrst,'reload schema';
