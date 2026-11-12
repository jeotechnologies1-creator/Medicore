-- Require AAL2 for writes by staff roles that can change financial or clinical
-- records. The enforcement switch is stored separately and defaults to on.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

insert into public.system_settings(setting_key,setting_value)
values('mfa_enforcement','{"enabled":true}'::jsonb)
on conflict(setting_key) do nothing;

create or replace function public.has_aal2()
returns boolean language sql stable set search_path=public as $$
  select coalesce((auth.jwt()->>'aal')='aal2',false)
$$;
revoke all on function public.has_aal2() from public,anon;
grant execute on function public.has_aal2() to authenticated;

create or replace function public.mfa_required_for_current_user()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((
    select p.status::text='active'
      and p.role::text=any(array['super_admin','accountant','doctor','pharmacist','surgeon','specialist'])
      and coalesce((select (s.setting_value->>'enabled')::boolean
        from public.system_settings s where s.setting_key='mfa_enforcement'),true)
    from public.profiles p where p.auth_user_id=auth.uid() limit 1
  ),false)
$$;
revoke all on function public.mfa_required_for_current_user() from public,anon;
grant execute on function public.mfa_required_for_current_user() to authenticated;

-- Row triggers also protect writes performed inside SECURITY DEFINER RPCs,
-- where the table owner's privileges would otherwise bypass RLS policies.
create or replace function public.enforce_aal2_for_sensitive_write()
returns trigger language plpgsql set search_path=public as $$
begin
  if auth.uid() is not null and public.mfa_required_for_current_user() and not public.has_aal2() then
    raise exception 'AAL2 verification is required for this write.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.enforce_aal2_for_sensitive_write() from public,anon,authenticated;

-- The restrictive checks intersect with existing command policies. Requiring
-- AAL2 on each write command prevents a permissive role policy from bypassing
-- MFA. The pending-profile gate from migration 33 remains independently active.
do $$
declare relation record;
begin
  for relation in
    select n.nspname,c.relname,c.relispartition
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  loop
    execute format('alter table %I.%I enable row level security',relation.nspname,relation.relname);
    execute format('drop policy if exists %I on %I.%I','require aal2 for insert',relation.nspname,relation.relname);
    execute format('create policy %I on %I.%I as restrictive for insert to authenticated with check (not public.mfa_required_for_current_user() or public.has_aal2())',
      'require aal2 for insert',relation.nspname,relation.relname);
    execute format('drop policy if exists %I on %I.%I','require aal2 for update',relation.nspname,relation.relname);
    execute format('create policy %I on %I.%I as restrictive for update to authenticated using (not public.mfa_required_for_current_user() or public.has_aal2()) with check (not public.mfa_required_for_current_user() or public.has_aal2())',
      'require aal2 for update',relation.nspname,relation.relname);
    execute format('drop policy if exists %I on %I.%I','require aal2 for delete',relation.nspname,relation.relname);
    execute format('create policy %I on %I.%I as restrictive for delete to authenticated using (not public.mfa_required_for_current_user() or public.has_aal2())',
      'require aal2 for delete',relation.nspname,relation.relname);
    if not relation.relispartition then
      execute format('drop trigger if exists enforce_aal2_for_sensitive_write on %I.%I',relation.nspname,relation.relname);
      execute format('create trigger enforce_aal2_for_sensitive_write before insert or update or delete on %I.%I for each row execute function public.enforce_aal2_for_sensitive_write()',
        relation.nspname,relation.relname);
    end if;
  end loop;
end $$;

commit;
notify pgrst,'reload schema';
