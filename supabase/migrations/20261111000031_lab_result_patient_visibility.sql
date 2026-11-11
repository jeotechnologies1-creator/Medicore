-- Apply after 20261103000030_him_records.sql.
-- Rollback before migration: the matching rollback drops only this restrictive
-- read policy. It does not modify lab orders or result data.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

drop policy if exists "patients read finalized lab results" on public.lab_orders;
create policy "patients read finalized lab results" on public.lab_orders
  as restrictive for select to authenticated using (
    coalesce((
      select profile.role::text
      from public.profiles profile
      where profile.auth_user_id = auth.uid()
        and profile.status::text = 'active'
      limit 1
    ), '') <> 'patient'
    or result_status in ('final', 'corrected')
  );

commit;
notify pgrst, 'reload schema';
