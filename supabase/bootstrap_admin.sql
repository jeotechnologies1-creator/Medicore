-- DEVELOPMENT BOOTSTRAP ONLY
-- Sign in as username: admin
-- Password: admin
-- Change this immediately for any environment that is not local development.
-- Run this after all of the application migrations in README.md.

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
      raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
      email_change_token_new, email_change, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', admin_auth_id, 'authenticated', 'authenticated',
      'admin@medicore.local', crypt('admin', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"System Administrator"}'::jsonb, '', '', '', '', now(), now()
    );
  else
    update auth.users
    set encrypted_password = crypt('admin', gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmation_token = coalesce(confirmation_token, ''),
        recovery_token = coalesce(recovery_token, ''),
        email_change_token_new = coalesce(email_change_token_new, ''),
        email_change = coalesce(email_change, ''),
        updated_at = now()
    where id = admin_auth_id;
  end if;

  -- GoTrue requires an email identity as well as the auth.users record. This
  -- upsert also repairs admin rows created by older versions of this script.
  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), admin_auth_id::text, admin_auth_id,
    jsonb_build_object('sub', admin_auth_id::text, 'email', 'admin@medicore.local'),
    'email', now(), now(), now()
  )
  on conflict (provider_id, provider) do update
    set user_id = excluded.user_id,
        identity_data = excluded.identity_data,
        updated_at = now();

  insert into public.profiles (auth_user_id, email, full_name, role, department, status)
  values (admin_auth_id, 'admin@medicore.local', 'System Administrator', 'super_admin', 'IT', 'active')
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        full_name = excluded.full_name,
        role = 'super_admin',
        department = coalesce(public.profiles.department, excluded.department),
        status = 'active';
end $$;
