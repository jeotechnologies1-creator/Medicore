-- Quarantine new Auth identities until trusted provisioning activates them.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

do $$
declare type_schema text; type_name text;
begin
  select n.nspname,t.typname into type_schema,type_name
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace r on r.oid=c.relnamespace
  join pg_type t on t.oid=a.atttypid join pg_namespace n on n.oid=t.typnamespace
  where r.nspname='public' and c.relname='profiles' and a.attname='role' and a.attnum>0 and not a.attisdropped and t.typtype='e';
  if type_name is not null then execute format('alter type %I.%I add value if not exists %L',type_schema,type_name,'unassigned'); end if;
  select n.nspname,t.typname into type_schema,type_name
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace r on r.oid=c.relnamespace
  join pg_type t on t.oid=a.atttypid join pg_namespace n on n.oid=t.typnamespace
  where r.nspname='public' and c.relname='profiles' and a.attname='status' and a.attnum>0 and not a.attisdropped and t.typtype='e';
  if type_name is not null then execute format('alter type %I.%I add value if not exists %L',type_schema,type_name,'pending'); end if;
end $$;

alter table public.profiles alter column role drop default;
alter table public.profiles drop constraint if exists profiles_role_allowed;
alter table public.profiles add constraint profiles_role_allowed check (role::text in (
  'super_admin','doctor','nurse','receptionist','pharmacist','laboratory_scientist','radiographer',
  'accountant','records_officer','surgeon','specialist','theatre_staff','patient','unassigned'
)) not valid;
alter table public.profiles drop constraint if exists profiles_status_allowed;
alter table public.profiles add constraint profiles_status_allowed check (status::text in ('active','inactive','suspended','pending')) not valid;

create or replace function public.has_active_application_profile()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(exists(select 1 from public.profiles p where p.auth_user_id=auth.uid()
    and p.status::text='active' and p.role::text in ('super_admin','doctor','nurse','receptionist',
    'pharmacist','laboratory_scientist','radiographer','accountant','records_officer','surgeon',
    'specialist','theatre_staff','patient')),false)
$$;
revoke all on function public.has_active_application_profile() from public,anon;
grant execute on function public.has_active_application_profile() to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare attached_rows integer;
begin
  insert into public.profiles(auth_user_id,email,full_name,role,status)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),'unassigned','pending')
  on conflict(email) do update set auth_user_id=excluded.auth_user_id,role='unassigned',status='pending'
    where public.profiles.auth_user_id is null;
  get diagnostics attached_rows = row_count;
  if attached_rows=0 then raise exception 'Auth identity could not be safely attached to an unused profile.'; end if;
  return new;
end $$;
revoke all on function public.handle_new_auth_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.current_profile_role()
returns text language sql stable security definer set search_path=public as $$
  select p.role::text from public.profiles p where p.auth_user_id=auth.uid() and p.status::text='active'
    and p.role::text in ('super_admin','doctor','nurse','receptionist','pharmacist','laboratory_scientist',
      'radiographer','accountant','records_officer','surgeon','specialist','theatre_staff','patient') limit 1
$$;
create or replace function public.has_any_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(exists(select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.status::text='active'
    and p.role::text in ('super_admin','doctor','nurse','receptionist','pharmacist','laboratory_scientist',
      'radiographer','accountant','records_officer','surgeon','specialist','theatre_staff','patient')
    and p.role::text=any(allowed_roles)),false)
$$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.current_profile_role() in ('super_admin','doctor','nurse','receptionist','pharmacist',
    'laboratory_scientist','radiographer','accountant','records_officer','surgeon','specialist','theatre_staff'),false)
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$ select public.has_any_role(array['super_admin']) $$;
create or replace function public.is_clinical_staff()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.current_profile_role() in ('super_admin','doctor','nurse','pharmacist','laboratory_scientist',
    'radiographer','surgeon','specialist','theatre_staff'),false)
$$;

do $$
declare relation record;
begin
  for relation in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and not c.relispartition
  loop
    execute format('alter table %I.%I enable row level security',relation.nspname,relation.relname);
    execute format('drop policy if exists %I on %I.%I','active application profile gate',relation.nspname,relation.relname);
    execute format('create policy %I on %I.%I as restrictive for all to authenticated using (public.has_active_application_profile()) with check (public.has_active_application_profile())',
      'active application profile gate',relation.nspname,relation.relname);
  end loop;
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "active application profile gate" on storage.objects';
    execute 'create policy "active application profile gate" on storage.objects as restrictive for all to authenticated using (public.has_active_application_profile()) with check (public.has_active_application_profile())';
  end if;
end $$;

commit;
notify pgrst,'reload schema';
