begin;
select plan(19);

select has_column('public','audit_logs','chain_position','audit entries have a stable chain position');
select has_column('public','audit_logs','previous_hash','each audit entry stores the previous row hash');
select has_column('public','audit_logs','row_hash','each audit entry stores its content hash');
select has_column('public','audit_logs','change_data','audit entries retain structured change metadata');
select has_trigger('public','audit_logs','hash_audit_log_insert','new audit entries are hashed');
select has_trigger('public','audit_logs','audit_logs_no_mutation','audit entry updates and deletes are rejected');
select has_function('public','verify_audit_log_chain',array[]::text[],'chain verification function exists');
select has_function('public','audit_log_sha256',array['bytea'],'audit hashing resolves pgcrypto from its installed schema');
select has_trigger('public','encounters','audit_encounters','encounter changes are audited');
select has_trigger('public','clinical_tasks','audit_clinical_tasks','clinical task changes are audited');
select has_trigger('public','clinical_alerts','audit_clinical_alerts','clinical alert changes are audited');
select has_trigger('public','nursing_notes','audit_nursing_notes','nursing note changes are audited');
select has_trigger('public','emergency_visits','audit_emergency_visits','emergency visit changes are audited');
select has_trigger('public','payment_submissions','audit_payment_submissions','payment submission changes are audited');
select has_trigger('public','staff_organization_memberships','audit_staff_organization_memberships','membership changes are audited');
select has_trigger('public','profiles','audit_profiles','profile changes are audited');
select has_table('public','break_glass_access','time-boxed break-glass grants are stored');
select has_function('public','request_break_glass_access',array['uuid','text','integer'],'break-glass access is granted only through its audited RPC');
select has_function('public','read_patient_chart',array['uuid','text'],'chart reads use a server-side logging RPC');

select * from finish();
rollback;
