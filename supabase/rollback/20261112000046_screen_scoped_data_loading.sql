-- Keep the read-optimization indexes; dropping them during rollback could
-- cause production list queries to regress. Remove only the added RPCs.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
drop function if exists public.search_patients_page(text,text,uuid,integer,integer);
drop function if exists public.get_screen_kpis(uuid,date,date);
commit;
