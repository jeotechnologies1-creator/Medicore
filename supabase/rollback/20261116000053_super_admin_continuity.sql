begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

drop trigger if exists protect_last_active_super_admin on public.profiles;
drop function if exists public.protect_last_active_super_admin();
drop function if exists public.get_active_super_admin_count();

-- Keep the account_recovered audit action and RPC support so rollback does not
-- invalidate recovery records that may already have been written.

commit;
notify pgrst,'reload schema';
