begin;
select plan(2);

select ok(not exists(
 select 1 from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace
 cross join lateral aclexplode(d.defaclacl) acl
 where n.nspname='public' and d.defaclobjtype='f'
  and (acl.grantee=0 or acl.grantee='anon'::regrole)
),'new public-schema functions are not executable by PUBLIC or anon by default');

-- Keep the pre-existing migration-80 allowlist as a separate regression gate.
select ok(to_regprocedure('public.rollback_patient_import_batch(uuid,text)') is not null,
 'existing SECURITY DEFINER allowlist test function set remains present');

select * from finish();
rollback;
