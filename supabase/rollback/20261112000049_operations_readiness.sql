begin;
set local lock_timeout='2s';
set local statement_timeout='60s';

do $$ begin
  if coalesce((select (setting_value#>>'{}')::boolean from public.system_settings where setting_key='downtime_read_only_mode'),false) then
    raise exception 'Rollback blocked while downtime read-only mode is active.';
  end if;
  if exists(select 1 from public.monitoring_events) then
    raise exception 'Rollback blocked: monitoring telemetry exists and must be retained.';
  end if;
end $$;

drop function if exists public.list_dormant_staff(boolean);
drop function if exists public.get_operations_alerts();
drop function if exists public.set_downtime_read_only_mode(boolean);
drop function if exists public.get_downtime_read_only_mode();
drop trigger if exists protect_downtime_setting on public.system_settings;
drop function if exists public.protect_downtime_setting();
do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','patients','appointments','encounters','consultations','prescriptions','lab_orders','radiology_orders','vital_signs','admissions','nursing_notes','medication_orders','medication_administrations','billing','payment_submissions','payment_postings','payment_reversals','refund_requests','insurance_claims','insurance_memberships','patient_messages','clinical_tasks','clinical_alerts','patient_conditions','patient_allergies','patient_consents','patient_documents','patient_referral_letters','patient_record_referrals','medical_record_files','encounter_workflow_events','result_acknowledgements','family_cards','family_card_members','pharmacy_inventory','medication_lots','medication_dispense_events','wards','beds','surgeries','medical_offices','office_staff','staff_organization_memberships','organization_units'] loop
    if to_regclass('public.'||table_name) is not null then execute format('drop trigger if exists reject_downtime_writes on public.%I',table_name); end if;
  end loop;
  if to_regclass('storage.objects') is not null then execute 'drop trigger if exists reject_downtime_writes on storage.objects'; end if;
end $$;
drop trigger if exists reject_downtime_writes on public.system_settings;
drop function if exists public.reject_downtime_writes();
drop table if exists public.monitoring_events;
delete from public.system_settings where setting_key='downtime_read_only_mode' and setting_value='false'::jsonb;

commit;
