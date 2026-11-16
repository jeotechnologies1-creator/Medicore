-- Preserve imported safety datasets and their clinical sign-off history.
begin;
do $$ begin
  raise exception 'Unsafe rollback refused for 20261116000054: safety data and clinical sign-offs may already be in use; fix forward after review.';
end $$;
commit;
