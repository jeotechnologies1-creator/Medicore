begin;
set local lock_timeout='2s';
set local statement_timeout='0';

-- Candidate index for search_patient_directory(). Validate its benefit using
-- scripts/load-test.sql EXPLAIN output and the performance evidence template.
-- The function's wildcard predicate spans name, MRN, patient number, and phone
-- via one normalized expression, which existing per-column trigram indexes
-- cannot directly satisfy as a single indexed expression. Avoid concat_ws:
-- PostgreSQL marks it STABLE, so it is not legal in an index expression.
create index if not exists patients_directory_search_trgm_idx
  on public.patients using gin (
    lower(first_name || ' ' || last_name || coalesce(' ' || patient_number,'') || coalesce(' ' || medical_record_number,'') || coalesce(' ' || phone,'')) gin_trgm_ops
  );

commit;
