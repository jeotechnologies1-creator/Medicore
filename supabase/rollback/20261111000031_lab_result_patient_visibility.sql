-- Rollback plan, prepare before migration 31:
-- 1. Apply and verify migration 31 in staging with patient, clinician, and
--    laboratory accounts. Confirm patients can read only final/corrected rows.
-- 2. If rollback is required, run this script. It removes only the additional
--    patient visibility restriction; it does not change lab results or other
--    RLS policies.
begin;
set local lock_timeout = '2s';
drop policy if exists "patients read finalized lab results" on public.lab_orders;
commit;
notify pgrst, 'reload schema';
