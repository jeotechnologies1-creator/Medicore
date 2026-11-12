begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

create table if not exists public.monitoring_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('client_error','edge_error','auth_anomaly')),
  error_class text not null check (error_class in ('Error','TypeError','RangeError','ReferenceError','NetworkError','UnknownError')),
  module text not null check (module in ('app','auth','dashboard','patients','records','appointments','clinical','laboratory','radiology','pharmacy','billing','admissions','portal','settings','integration','notification','staff','monitoring','other')),
  environment text not null check (environment in ('development','staging','production','other')),
  created_at timestamptz not null default now()
);
create index if not exists monitoring_events_recent_type_idx on public.monitoring_events(event_type,created_at desc);
alter table public.monitoring_events enable row level security;
revoke all on public.monitoring_events from public,anon,authenticated;
grant select,insert on public.monitoring_events to service_role;

insert into public.system_settings(setting_key,setting_value)
values('downtime_read_only_mode','false'::jsonb) on conflict(setting_key) do nothing;

create or replace function public.protect_downtime_setting() returns trigger
language plpgsql set search_path=public as $$
declare target_key text;
begin
  target_key:=case when tg_op='DELETE' then old.setting_key else new.setting_key end;
  if target_key='downtime_read_only_mode' and current_setting('onemed.allow_downtime_setting_write',true) is distinct from 'true' then
    raise exception 'Change downtime mode only through the authorized control.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.protect_downtime_setting() from public,anon,authenticated;
drop trigger if exists protect_downtime_setting on public.system_settings;
create trigger protect_downtime_setting before insert or update or delete on public.system_settings
for each row execute function public.protect_downtime_setting();

create or replace function public.reject_downtime_writes() returns trigger
language plpgsql security definer set search_path=public as $$
declare downtime_enabled boolean; target_key text;
begin
  downtime_enabled:=coalesce((select (setting_value#>>'{}')::boolean from public.system_settings where setting_key='downtime_read_only_mode'),false);
  if downtime_enabled then
    if tg_table_name='system_settings' then
      if tg_op='DELETE' then target_key:=old.setting_key; else target_key:=new.setting_key; end if;
      if coalesce(current_setting('onemed.allow_downtime_setting_write',true),'false')='true' and target_key='downtime_read_only_mode' then
        if tg_op='DELETE' then return old; end if;
        return new;
      end if;
    end if;
    raise exception using errcode='55000',message='The EMR is in downtime read-only mode. Record the change on approved downtime forms.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.reject_downtime_writes() from public,anon,authenticated;
do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','patients','appointments','encounters','consultations','prescriptions','lab_orders','radiology_orders','vital_signs','admissions','nursing_notes','medication_orders','medication_administrations','billing','payment_submissions','payment_postings','payment_reversals','refund_requests','insurance_claims','insurance_memberships','patient_messages','clinical_tasks','clinical_alerts','patient_conditions','patient_allergies','patient_consents','patient_documents','patient_referral_letters','patient_record_referrals','medical_record_files','encounter_workflow_events','result_acknowledgements','family_cards','family_card_members','pharmacy_inventory','medication_lots','medication_dispense_events','wards','beds','surgeries','medical_offices','office_staff','staff_organization_memberships','organization_units'] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('drop trigger if exists reject_downtime_writes on public.%I',table_name);
      execute format('create trigger reject_downtime_writes before insert or update or delete on public.%I for each row execute function public.reject_downtime_writes()',table_name);
    end if;
  end loop;
  if to_regclass('storage.objects') is not null then
    execute 'drop trigger if exists reject_downtime_writes on storage.objects';
    execute 'create trigger reject_downtime_writes before insert or update or delete on storage.objects for each row execute function public.reject_downtime_writes()';
  end if;
end $$;
drop trigger if exists reject_downtime_writes on public.system_settings;
create trigger reject_downtime_writes before insert or update or delete on public.system_settings
for each row execute function public.reject_downtime_writes();

create or replace function public.get_downtime_read_only_mode()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select (setting_value#>>'{}')::boolean from public.system_settings where setting_key='downtime_read_only_mode'),false)
  where auth.uid() is not null and exists(select 1 from public.profiles where auth_user_id=auth.uid() and status::text='active')
$$;
revoke all on function public.get_downtime_read_only_mode() from public,anon;
grant execute on function public.get_downtime_read_only_mode() to authenticated;

create or replace function public.set_downtime_read_only_mode(p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_any_role(array['super_admin']) then raise exception 'Only Super Admin may change downtime mode.'; end if;
  perform set_config('onemed.allow_downtime_setting_write','true',true);
  insert into public.system_settings(setting_key,setting_value,updated_at)
  values('downtime_read_only_mode',to_jsonb(p_enabled),now())
  on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_at=excluded.updated_at;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,severity,change_data)
  select id,case when p_enabled then 'downtime_read_only_enabled' else 'downtime_read_only_disabled' end,'system_setting','downtime_read_only_mode','warning',jsonb_build_object('enabled',p_enabled)
  from public.profiles where auth_user_id=auth.uid() limit 1;
end $$;
revoke all on function public.set_downtime_read_only_mode(boolean) from public,anon;
grant execute on function public.set_downtime_read_only_mode(boolean) to authenticated;

create or replace function public.get_operations_alerts()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.has_any_role(array['super_admin','it_admin','doctor','laboratory_scientist']) then raise exception 'Operations alert access denied.'; end if;
  select jsonb_build_object(
    'failed_jobs',(select count(*) from public.fhir_exchange_jobs where status='failed'),
    'unacknowledged_critical_results',(select count(*) from public.result_acknowledgements where status in ('unacknowledged','escalated') and (due_at is null or due_at<=now())),
    'failed_outbound_messages',(select count(*) from public.outbound_messages where status='failed'),
    'authentication_anomalies',(select count(*) from public.account_admin_audit where outcome='failure' and created_at>=now()-interval '24 hours')+(select count(*) from public.monitoring_events where event_type='auth_anomaly' and created_at>=now()-interval '24 hours'),
    'edge_function_errors',(select count(*) from public.monitoring_events where event_type='edge_error' and created_at>=now()-interval '24 hours')
  ) into result;
  return result;
end $$;
revoke all on function public.get_operations_alerts() from public,anon;
grant execute on function public.get_operations_alerts() to authenticated;

create or replace function public.list_dormant_staff(p_suspend boolean default false)
returns table(profile_id uuid,full_name text,email text,role text,last_sign_in_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if not public.has_any_role(array['super_admin']) then raise exception 'Quarterly access review requires Super Admin.'; end if;
  if p_suspend then
    update public.profiles profile set status='suspended'
    from auth.users account
    where account.id=profile.auth_user_id and profile.status::text='active'
      and profile.role::text not in ('patient')
      and coalesce(account.last_sign_in_at,profile.created_at)<now()-interval '60 days';
    insert into public.audit_logs(user_id,action,entity_type,severity,change_data)
    select id,'dormant_staff_suspended','profile','warning',jsonb_build_object('suspension_threshold_days',60)
    from public.profiles where auth_user_id=auth.uid() limit 1;
  end if;
  return query select profile.id,profile.full_name,profile.email,profile.role::text,account.last_sign_in_at
    from public.profiles profile join auth.users account on account.id=profile.auth_user_id
    where profile.status::text in ('active','suspended') and profile.role::text not in ('patient')
      and coalesce(account.last_sign_in_at,profile.created_at)<now()-interval '60 days'
    order by coalesce(account.last_sign_in_at,profile.created_at);
end $$;
revoke all on function public.list_dormant_staff(boolean) from public,anon;
grant execute on function public.list_dormant_staff(boolean) to authenticated;

commit;
