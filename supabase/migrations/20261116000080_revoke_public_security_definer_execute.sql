begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

-- SECURITY DEFINER entry points must never inherit API execution through PUBLIC.
-- Keep explicit authenticated RPC grants intact, while removing inherited and
-- direct anon grants from every public-schema definer function.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.signature);
  end loop;
end $$;

-- RLS policies call these predicates as the authenticated role. They derive
-- identity from auth.uid() and remain the only helper grants added here.
grant execute on function public.has_any_role(text[]),public.is_admin(),public.is_staff(),
  public.is_clinical_staff(),public.can_read_patient_record(uuid),public.can_manage_patient_table(text),
  public.can_access_patient(uuid),public.has_patient_facility_access(uuid),
  public.has_org_permission(text,uuid,uuid),public.has_clinical_department_permission(uuid,text,text,boolean)
to authenticated;

-- The discharge flow calls these internally from owner-executed functions and
-- triggers. They are intentionally not callable by API roles.
revoke execute on function public.discharge_context(uuid),public.discharge_requirements_met(uuid)
  from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
