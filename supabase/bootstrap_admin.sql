-- DEVELOPMENT BOOTSTRAP ONLY
-- Sign in as username: admin
-- Password: admin
-- Change this immediately for any environment that is not local development.

create extension if not exists pgcrypto;

do $$
declare
  admin_auth_id uuid;
begin
  select id into admin_auth_id
  from auth.users
  where lower(email) = 'admin@medicore.local';

  if admin_auth_id is null then
    admin_auth_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', admin_auth_id, 'authenticated', 'authenticated',
      'admin@medicore.local', crypt('admin', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"System Administrator"}'::jsonb, now(), now()
    );
  else
    update auth.users
    set encrypted_password = crypt('admin', gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = admin_auth_id;
  end if;

  insert into public.profiles (auth_user_id, email, full_name, role, department, status)
  values (admin_auth_id, 'admin@medicore.local', 'System Administrator', 'super_admin', 'IT', 'active')
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        full_name = excluded.full_name,
        role = 'super_admin',
        department = coalesce(public.profiles.department, excluded.department),
        status = 'active';
end $$;
