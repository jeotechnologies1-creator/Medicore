begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

drop table if exists public.backup_status;

commit;
