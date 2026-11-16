-- Deploy the previous Edge Function versions before applying this rollback;
-- they do not call the monitoring or notification rate-limit scopes.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

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

commit;
