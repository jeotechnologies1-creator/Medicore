begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Account recovery is logged through the established service-only RPC. The
-- script has no human Auth UUID, so its actor is recorded as an explicit label.
alter table public.account_admin_audit
  drop constraint if exists account_admin_audit_action_check;
alter table public.account_admin_audit
  add constraint account_admin_audit_action_check
  check (action in ('account_created','role_changed','deactivated','account_recovered'));

create or replace function public.record_account_admin_audit(
  p_actor_auth_user_id uuid,p_target_auth_user_id uuid,p_target_email text,
  p_action text,p_assigned_role text,p_outcome text,p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_action not in ('account_created','role_changed','deactivated','account_recovered') or p_outcome not in ('success','failure') then
    raise exception 'Invalid account audit event' using errcode='22023';
  end if;
  insert into public.account_admin_audit(actor_auth_user_id,target_auth_user_id,target_email,action,assigned_role,outcome,details)
  values(p_actor_auth_user_id,p_target_auth_user_id,left(lower(p_target_email),320),p_action,p_assigned_role,p_outcome,coalesce(p_details,'{}'::jsonb));
end $$;
revoke all on function public.record_account_admin_audit(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_account_admin_audit(uuid,uuid,text,text,text,text,jsonb) to service_role;

create or replace function public.get_active_super_admin_count()
returns integer language plpgsql stable security definer set search_path=public as $$
declare active_count integer;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin']) then
    raise exception 'Active Super Admin count is restricted to Super Admins.' using errcode='42501';
  end if;
  select count(*)::integer into active_count
  from public.profiles
  where auth_user_id is not null and role::text='super_admin' and status::text='active';
  return active_count;
end $$;
revoke all on function public.get_active_super_admin_count() from public,anon;
grant execute on function public.get_active_super_admin_count() to authenticated;

create or replace function public.protect_last_active_super_admin()
returns trigger language plpgsql security definer set search_path=public as $$
declare active_count integer;
begin
  if old.auth_user_id is null or old.role::text<>'super_admin' or old.status::text<>'active' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  if tg_op='UPDATE' and new.role::text='super_admin' and new.status::text='active' then
    return new;
  end if;

  -- Serialize changes to active Super Admin membership so two concurrent
  -- demotions/deactivations cannot both observe a second administrator.
  perform pg_advisory_xact_lock(hashtextextended('public.profiles.active_super_admin_membership',0));
  select count(*)::integer into active_count
  from public.profiles
  where auth_user_id is not null and role::text='super_admin' and status::text='active';

  if active_count<=1 then
    raise exception 'Cannot demote, suspend, or delete the last active Super Admin. Activate another Super Admin first.'
      using errcode='P0001';
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.protect_last_active_super_admin() from public,anon,authenticated;
drop trigger if exists protect_last_active_super_admin on public.profiles;
create trigger protect_last_active_super_admin
before update of role,status or delete on public.profiles
for each row execute function public.protect_last_active_super_admin();

commit;
notify pgrst,'reload schema';
