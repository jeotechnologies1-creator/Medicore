begin;
select plan(21);

select has_table('public','privacy_notice_versions','versioned privacy notice and terms metadata exists');
select has_table('public','privacy_notice_acceptances','acceptance is recorded per profile and version');
select has_function('public','record_privacy_notice_acceptance',array['text','text'],'notice acceptance uses an authenticated RPC');
select has_column('public','patient_consents','consent_version','consent records retain the form version');
select has_column('public','patient_consents','witness_name','consent records retain a witness when supplied');
select has_column('public','patient_consents','withdrawn_at','withdrawals are timestamped');
select has_function('public','record_patient_consent',array['uuid','text','text','text','text','text'],'consent capture is handled server-side');
select has_function('public','read_patient_consents',array['uuid'],'consent reads are scoped and audited');
select has_table('public','data_subject_requests','access correction and restriction requests are tracked');
select has_function('public','create_data_subject_request',array['uuid','text','text'],'patients can submit data-subject requests');
select has_function('public','list_data_subject_request_queue',array[]::text[],'staff can review the due-date queue');
select has_table('public','disclosure_register','disclosures are recorded');
select has_table('public','retention_schedule','retention periods have approval state');
select has_table('public','legal_holds','legal holds can block retention actions');
select has_table('public','retention_action_requests','archive and disposal require approval records');
select has_function('public','request_retention_action',array['uuid','text','text','text','text'],'retention actions are submitted as requests');
select has_function('public','approve_retention_action',array['uuid','boolean','text'],'retention actions require a separate approver');
select has_table('public','breach_register','privacy incidents have a restricted register');
select has_function('public','report_privacy_breach',array['timestamp with time zone','text','text[]','integer'],'breach reports are captured server-side');
select has_function('public','record_disclosure',array['uuid','text','text','text[]','text','text'],'disclosure events are registered by an authorized staff RPC');

select * from finish();
rollback;
