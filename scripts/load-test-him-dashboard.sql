-- HIM analytics performance check. Run against a disposable Supabase database
-- after creating representative encounter/admission/diagnosis/registry volume.
-- Supply a facility UUID, start date, and end date for an authorized test staff
-- identity; set request.jwt.claim.sub to that staff profile's auth.users UUID.
-- Example: psql ... -v facility_id=... -v start_date=2026-01-01 -v end_date=2026-12-31
begin;
set local statement_timeout='15min';
set local lock_timeout='5s';
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub=:'auth_user_id';
explain (analyze,buffers)
select public.get_him_dashboard_analytics(:'facility_id'::uuid,:'start_date'::date,:'end_date'::date);
rollback;
