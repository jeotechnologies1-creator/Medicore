begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Restore the previous AAL2-only rule. Reverting removes the 24-hour freshness
-- enforcement, so use only as a coordinated rollback of the forward migration.
create or replace function public.has_aal2()
returns boolean language sql stable set search_path=public as $$
  select coalesce((auth.jwt()->>'aal')='aal2',false)
$$;

comment on function public.has_aal2() is null;
notify pgrst,'reload schema';
commit;
