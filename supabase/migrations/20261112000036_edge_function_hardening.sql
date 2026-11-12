begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table if not exists public.edge_rate_limits (
  scope text not null,
  dimension text not null check (dimension in ('user','ip')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started timestamptz not null,
  hits integer not null check (hits > 0),
  primary key (scope,dimension,key_hash)
);
alter table public.edge_rate_limits enable row level security;
create index if not exists edge_rate_limits_window_idx on public.edge_rate_limits(window_started);
revoke all on public.edge_rate_limits from public,anon,authenticated;
grant select,insert,update,delete on public.edge_rate_limits to service_role;

create or replace function public.consume_edge_rate_limit(
  p_scope text,p_user_key text,p_ip_key text,p_max_hits integer,p_window_seconds integer
) returns boolean language plpgsql security definer set search_path=public as $$
declare now_at timestamptz:=clock_timestamp(); user_hits integer; ip_hits integer;
begin
  if p_scope not in ('create-staff','create-patient-portal','integration-webhook','integration-dispatch')
     or p_max_hits not between 1 and 1000 or p_window_seconds not between 1 and 86400
     or p_ip_key !~ '^[0-9a-f]{64}$' or (p_user_key is not null and p_user_key !~ '^[0-9a-f]{64}$') then
    raise exception 'Invalid rate limit request' using errcode='22023';
  end if;
  insert into public.edge_rate_limits(scope,dimension,key_hash,window_started,hits)
    values(p_scope,'ip',p_ip_key,now_at,1)
  on conflict(scope,dimension,key_hash) do update set
    hits=case when public.edge_rate_limits.window_started <= now_at-make_interval(secs=>p_window_seconds) then 1 else public.edge_rate_limits.hits+1 end,
    window_started=case when public.edge_rate_limits.window_started <= now_at-make_interval(secs=>p_window_seconds) then now_at else public.edge_rate_limits.window_started end
  returning hits into ip_hits;
  if p_user_key is not null then
    insert into public.edge_rate_limits(scope,dimension,key_hash,window_started,hits)
      values(p_scope,'user',p_user_key,now_at,1)
    on conflict(scope,dimension,key_hash) do update set
      hits=case when public.edge_rate_limits.window_started <= now_at-make_interval(secs=>p_window_seconds) then 1 else public.edge_rate_limits.hits+1 end,
      window_started=case when public.edge_rate_limits.window_started <= now_at-make_interval(secs=>p_window_seconds) then now_at else public.edge_rate_limits.window_started end
    returning hits into user_hits;
  else user_hits:=1; end if;
  delete from public.edge_rate_limits where window_started < now_at-interval '1 day';
  return ip_hits<=p_max_hits and user_hits<=p_max_hits;
end $$;
revoke all on function public.consume_edge_rate_limit(text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_edge_rate_limit(text,text,text,integer,integer) to service_role;

create table if not exists public.account_admin_audit (
  id bigint generated always as identity primary key,
  actor_auth_user_id uuid,
  target_auth_user_id uuid,
  target_email text,
  action text not null check (action in ('account_created','role_changed','deactivated')),
  assigned_role text,
  outcome text not null check (outcome in ('success','failure')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists account_admin_audit_created_idx on public.account_admin_audit(created_at desc);
create index if not exists account_admin_audit_target_idx on public.account_admin_audit(target_auth_user_id,created_at desc);
alter table public.account_admin_audit enable row level security;
revoke all on public.account_admin_audit from public,anon,authenticated;
grant select,insert on public.account_admin_audit to service_role;
grant usage,select on sequence public.account_admin_audit_id_seq to service_role;

create or replace function public.record_account_admin_audit(
  p_actor_auth_user_id uuid,p_target_auth_user_id uuid,p_target_email text,
  p_action text,p_assigned_role text,p_outcome text,p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_action not in ('account_created','role_changed','deactivated') or p_outcome not in ('success','failure') then
    raise exception 'Invalid account audit event' using errcode='22023';
  end if;
  insert into public.account_admin_audit(actor_auth_user_id,target_auth_user_id,target_email,action,assigned_role,outcome,details)
  values(p_actor_auth_user_id,p_target_auth_user_id,left(lower(p_target_email),320),p_action,p_assigned_role,p_outcome,coalesce(p_details,'{}'::jsonb));
end $$;
revoke all on function public.record_account_admin_audit(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_account_admin_audit(uuid,uuid,text,text,text,text,jsonb) to service_role;

create or replace function public.audit_profile_account_admin_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
  actor:=auth.uid();
  if tg_op='INSERT' then
    insert into public.account_admin_audit(actor_auth_user_id,target_auth_user_id,target_email,action,assigned_role,outcome,details)
    values(actor,new.auth_user_id,new.email,'account_created',new.role::text,'success',jsonb_build_object('status',new.status::text));
  else
    if old.role is distinct from new.role then
      insert into public.account_admin_audit(actor_auth_user_id,target_auth_user_id,target_email,action,assigned_role,outcome,details)
      values(actor,new.auth_user_id,new.email,'role_changed',new.role::text,'success',jsonb_build_object('old_role',old.role::text,'new_status',new.status::text));
    end if;
    if old.status::text not in ('inactive','suspended') and new.status::text in ('inactive','suspended') then
      insert into public.account_admin_audit(actor_auth_user_id,target_auth_user_id,target_email,action,assigned_role,outcome,details)
      values(actor,new.auth_user_id,new.email,'deactivated',new.role::text,'success',jsonb_build_object('status',new.status::text));
    end if;
  end if;
  return new;
end $$;
revoke all on function public.audit_profile_account_admin_change() from public,anon,authenticated;
drop trigger if exists audit_profile_account_admin_change on public.profiles;
create trigger audit_profile_account_admin_change after insert or update of role,status on public.profiles
for each row execute function public.audit_profile_account_admin_change();

commit;
notify pgrst,'reload schema';
