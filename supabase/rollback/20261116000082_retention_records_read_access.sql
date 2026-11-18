begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

revoke select on public.retention_schedule,public.legal_holds,public.retention_action_requests from authenticated;
drop policy if exists retention_schedule_records_read on public.retention_schedule;
drop policy if exists legal_holds_records_read on public.legal_holds;
drop policy if exists retention_action_records_read on public.retention_action_requests;

notify pgrst,'reload schema';
commit;
