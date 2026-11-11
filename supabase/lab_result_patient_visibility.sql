-- Patients may read their own finalized lab results, but must not see
-- preliminary, pending, or cancelled results through the Data API.
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
