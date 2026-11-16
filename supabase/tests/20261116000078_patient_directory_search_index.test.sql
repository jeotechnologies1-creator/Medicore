begin;
select plan(3);

select ok(exists(
  select 1 from pg_class i join pg_index x on x.indexrelid=i.oid
  join pg_am am on am.oid=i.relam
  where i.oid='public.patients_directory_search_trgm_idx'::regclass and am.amname='gin' and x.indisvalid
), 'patient directory search uses a valid GIN index');
select ok((select pg_get_expr(indexprs,indrelid) from pg_index where indexrelid='public.patients_directory_search_trgm_idx'::regclass) like '%lower%' and
          (select pg_get_expr(indexprs,indrelid) from pg_index where indexrelid='public.patients_directory_search_trgm_idx'::regclass) not like '%concat_ws%',
          'indexed expression uses immutable normalization');
select ok((select pg_get_indexdef('public.patients_directory_search_trgm_idx'::regclass) like '%gin_trgm_ops%'),'index uses trigram operator class');

select * from finish();
rollback;
