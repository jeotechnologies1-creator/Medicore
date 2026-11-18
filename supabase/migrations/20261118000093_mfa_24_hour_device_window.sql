begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Require a TOTP verification less than 24 hours old for privileged writes.
-- Supabase places successful MFA checks in the signed JWT amr claim, so this
-- rule applies to RLS and SECURITY DEFINER write guards as well as the UI.
create or replace function public.has_aal2()
returns boolean language sql stable set search_path=public as $$
  select coalesce(
    (auth.jwt()->>'aal')='aal2'
    and jsonb_typeof(auth.jwt()->'amr')='array'
    and exists (
      select 1
      from jsonb_array_elements(auth.jwt()->'amr') method
      where method->>'method'='totp'
        and (method->>'timestamp') ~ '^[0-9]+([.][0-9]+)?$'
        and to_timestamp((method->>'timestamp')::double precision) >= now()-interval '24 hours'
        and to_timestamp((method->>'timestamp')::double precision) <= now()+interval '1 minute'
    ),false)
$$;

comment on function public.has_aal2() is
  'True only for an AAL2 JWT with a TOTP verification less than 24 hours old.';

notify pgrst,'reload schema';
commit;
