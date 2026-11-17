begin;
do $$ begin
 raise exception 'Reviewed rollback required: FHIR audit events are retained in the immutable audit chain.';
end $$;
commit;
