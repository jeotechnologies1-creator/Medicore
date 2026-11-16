begin;
do $$ begin
  raise exception 'Unsafe rollback refused for 20261116000077: FHIR read AuditEvents are retained in the immutable audit chain.';
end $$;
commit;
