-- HIM physical file tracking rollback plan, prepare before applying migration 30:
-- 1. Validate migration 30 and this rollback on an isolated staging copy first.
-- 2. Stop new file requests and export medical_record_files, medical_record_movements,
--    and medical_record_movement_events for the facility's retained casework.
-- 3. Confirm the application no longer calls either RPC and that exported data
--    has been retained under the hospital's approved records schedule.
-- 4. Run this script in a planned window. It drops HIM circulation data and RPCs;
--    patient, encounter, document, billing, and clinical source records remain.
begin;
set local lock_timeout='2s';
drop function if exists public.transition_medical_record_movement(uuid,text,text);
drop function if exists public.request_medical_record_file(uuid,text,text,timestamptz,text);
drop function if exists public.get_him_dashboard_summary();
drop table if exists public.medical_record_movement_events;
drop table if exists public.medical_record_movements;
drop table if exists public.medical_record_files;
delete from public.role_permission_grants g using public.onemed_migration_20261103000030_grants m
 where g.role=m.role and g.permission_key=m.permission_key and g.scope=m.scope;
drop table if exists public.onemed_migration_20261103000030_grants;
delete from public.permission_catalog where permission_key in ('records.file.read','records.file.manage')
 and not exists(select 1 from public.role_permission_grants g where g.permission_key=permission_catalog.permission_key)
 and not exists(select 1 from public.profile_permission_assignments a where a.permission_key=permission_catalog.permission_key);
commit;
notify pgrst,'reload schema';
