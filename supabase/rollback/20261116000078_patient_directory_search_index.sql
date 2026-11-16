begin;
set local lock_timeout='2s';
drop index if exists public.patients_directory_search_trgm_idx;
commit;
