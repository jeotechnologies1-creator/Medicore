begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Preserve imported terms and coded clinical records. Emergency rollback must
-- be reviewed separately after disabling terminology entry and exporting data.
do $$ begin
  raise exception 'Unsafe terminology rollback refused: dropping coded clinical data or imported terminology requires a reviewed data-preserving migration.';
end $$;

commit;
