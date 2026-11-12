-- Run after restoring the database to an isolated recovery project.
-- Counts are intentionally explicit so schema changes cause a review of this checklist.
select 'patients' as table_name,count(*) as row_count from public.patients
union all select 'profiles',count(*) from public.profiles
union all select 'appointments',count(*) from public.appointments
union all select 'encounters',count(*) from public.encounters
union all select 'consultations',count(*) from public.consultations
union all select 'prescriptions',count(*) from public.prescriptions
union all select 'lab_orders',count(*) from public.lab_orders
union all select 'radiology_orders',count(*) from public.radiology_orders
union all select 'vital_signs',count(*) from public.vital_signs
union all select 'admissions',count(*) from public.admissions
union all select 'billing',count(*) from public.billing
union all select 'payment_postings',count(*) from public.payment_postings
union all select 'patient_documents',count(*) from public.patient_documents
union all select 'audit_logs',count(*) from public.audit_logs
union all select 'result_acknowledgements',count(*) from public.result_acknowledgements
union all select 'outbound_messages',count(*) from public.outbound_messages
order by table_name;

-- Must return {"valid": true, ...}; run as a temporary Super Admin recovery account.
select public.verify_audit_log_chain() as audit_chain_verification;

-- Compare bucket/object counts with the backup manifest and source-project inventory.
select bucket_id,count(*) as object_count from storage.objects group by bucket_id order by bucket_id;
