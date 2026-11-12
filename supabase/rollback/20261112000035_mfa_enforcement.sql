-- MFA is a security requirement; removing its database gates would re-enable
-- sensitive writes from AAL1 sessions. Preserve the controls and fix forward.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'Unsafe rollback refused: removing AAL2 write gates weakens clinical and financial security. Fix forward.';
end $$;
commit;
