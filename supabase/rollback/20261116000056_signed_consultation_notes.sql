-- Signed notes and attributed addenda are clinical legal history; preserve them.
begin;
do $$ begin
  raise exception 'Unsafe rollback refused for 20261116000056: signed consultation history is immutable; fix forward after clinical review.';
end $$;
commit;
