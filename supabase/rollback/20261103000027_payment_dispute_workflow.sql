-- Rollback plan (prepare before applying migration 27):
-- 1. Pause webhook delivery for payment.dispute.* events and export all four
--    dispute tables for operational records.
-- 2. Apply this script in staging first; verify no application still calls
--    these RPCs or selects these tables before production rollback.
-- 3. Run this transaction in production only after that verification.
-- This removes dispute casework and alert history. Existing payment/refund
-- records and webhook inbox rows are preserved.
begin;
set local lock_timeout='2s';
drop trigger if exists audit_payment_dispute_change on public.payment_disputes;
drop function if exists public.process_payment_dispute_event(uuid,text,text,jsonb);
drop function if exists public.audit_payment_dispute_change();
drop function if exists public.acknowledge_payment_dispute_alert(uuid);
drop function if exists public.update_payment_dispute_response(uuid,text,text,jsonb);
drop function if exists public.configure_payment_dispute_thresholds(uuid,integer,integer,integer,numeric,numeric);
drop table if exists public.payment_dispute_alerts;
drop table if exists public.payment_dispute_history;
drop table if exists public.payment_disputes;
drop table if exists public.payment_dispute_thresholds;
commit;
notify pgrst,'reload schema';
