import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const specialistAuthoring = await read('supabase/migrations/20261103000025_specialist_clinical_authoring.sql');
const clinicalRetention = await read('supabase/migrations/20261103000026_clinical_record_retention.sql');
const clinicalRetentionRollback = await read('supabase/rollback/20261103000026_clinical_record_retention.sql');
const clinicalRetentionPlan = await read('docs/deployment/rollback-clinical-record-retention.md');
const himRecords = await read('supabase/migrations/20261103000030_him_records.sql');
const himMigration = await read('supabase/migrations/20261103000030_him_records.sql');
const himRollback = await read('supabase/rollback/20261103000030_him_records.sql');
const stagingGuide = await read('infra/supabase-staging/README.md');
const stagingConfig = await read('infra/supabase-staging/supabase/config.toml');
const pendingAuthMigration = await read('supabase/migrations/20261112000033_pending_auth_access_gate.sql');
const financialFacilityMigration = await read('supabase/migrations/20261112000034_financial_facility_scope.sql');
const localAuthConfig = await read('supabase/config.toml');
const pendingAuthTest = await read('supabase/tests/pending_auth_access_gate.test.sql');
const [app, core, auth, portal, supabaseClient, schema, diagnostics, quality, hardening, activation, authorization, system, patients, safeCore, records, layout, people, staffFunction, roleMigration, hospitalWorkflows, workflowCompletion, organization, organizationUi, organizationTest, finance, financeTest, operations, clinicalRls, clinicalMigration, pharmacy, styles, ui] = await Promise.all([
    read('src/app.js'),
    read('src/js/core.js'),
    read('src/js/auth.js'),
    read('src/js/modules/portal.js'),
    read('src/supabase.js'),
    read('supabase/migrations/20261026000001_schema.sql'),
    read('src/js/modules/diagnostics.js'),
    read('supabase/migrations/20261026000010_quality_safety_upgrade.sql'),
    read('supabase/migrations/20261026000008_production_hardening.sql'),
    read('supabase/migrations/20261026000011_app_activation.sql'),
    read('supabase/migrations/20261026000012_role_authorization.sql'),
    read('src/js/modules/system.js'),
    read('src/js/modules/patients.js'),
    read('supabase/migrations/20261026000013_safe_core_multibranch.sql'),
    read('src/js/modules/records.js'),
    read('src/js/layout.js'),
    read('src/js/modules/people.js'),
    read('supabase/functions/create-staff/index.ts'),
    read('supabase/migrations/20261026000012_role_authorization.sql'),
    read('supabase/migrations/20261026000017_hospital_workflows.sql'),
    read('supabase/migrations/20261026000018_workflow_completion.sql'),
    read('supabase/migrations/20261026000019_organization_permissions.sql'),
    read('src/js/modules/system.js'),
    read('supabase/tests/core_workflows.test.sql'),
    read('supabase/migrations/20261026000020_finance_posting_refunds.sql'),
    read('supabase/tests/core_workflows.test.sql'),
    read('src/js/modules/operations.js'),
    read('supabase/migrations/20261026000021_clinical_department_rls.sql'),
    read('supabase/migrations/20261026000021_clinical_department_rls.sql'),
    read('supabase/migrations/20261026000009_atomic_pharmacy_dispensing.sql'),
    read('src/styles.css'),
    read('src/js/ui.js')
]);
const criticalLabMigration = await read('supabase/migrations/20261112000032_critical_lab_in_app_alerts.sql');
assert.match(criticalLabMigration, /set local lock_timeout\s*=\s*'2s'/, 'Critical lab migration must bound lock acquisition.');

assert.equal(/setInterval\s*\(/.test(app), false, 'The app must not poll or refresh records in the background.');
assert.match(app, /persistNotificationReadState/, 'Notification read changes must be persisted.');
assert.match(app, /notif\.type === 'critical_lab_result'\) setActiveModule\('laboratory'\)/, 'Selecting a critical lab notification must open the laboratory module.');
assert.match(core, /failures:/, 'Data-load failures must be returned to the UI.');
assert.match(hardening, /staff or patient read patients/, 'Patient data must have a scoped read policy.');
assert.match(hardening, /admins read audit logs/, 'Audit logs must remain administrator-only.');
assert.match(activation, /users read own notifications/, 'Notifications must be private to their recipient.');
assert.match(activation, /staff read directory/, 'Staff workflows must be able to resolve a staff directory.');
assert.match(authorization, /has_any_role/, 'Database authorization must be role based.');
assert.match(authorization, /admins manage system settings/, 'System settings must be administrator-only.');
assert.match(authorization, /pg_policies/, 'Authorization migration must remove stale policies before applying role rules.');
assert.match(core, /patientId: row\.patient_id/, 'Patient-linked profiles must retain their patient ID for portal access.');
assert.doesNotMatch(core, /role: row\.role \|\| 'super_admin'/, 'Incomplete directory rows must never default to an administrator role.');
assert.doesNotMatch(schema, /role text not null default 'super_admin'/, 'New profiles must never default to administrator.');
assert.match(auth, /data\?\.status !== 'active'/, 'Inactive profiles must be signed out before entering the application UI.');
assert.match(auth, /let sessionRevision = 0/, 'Concurrent authentication events must be ordered so stale profile reads cannot restore a signed-out user.');
assert.match(auth, /if \(!session\?\.user\) \{\s*clearSignedOutState\(\);/, 'Remote sign-out events must clear authenticated EMR state.');
assert.match(auth, /revision !== sessionRevision/, 'Profile lookups completing after a newer auth event must be ignored.');
assert.match(app, /if \(!user\) \{\s*setNotifications\(\[\]\)/, 'User-scoped notifications must be cleared when the session ends.');
assert.doesNotMatch(auth, /roleBasedAccess === false\) return true/, 'Browser settings must not disable module access checks.');
assert.doesNotMatch(auth, /savedLocal\.length/, 'Browser-local role matrices must not override the server-saved access policy.');
assert.match(supabaseClient, /data\?\.status === 'active'/, 'Password login must reject inactive profiles.');
assert.match(portal, /sender_profile_id: user\?\.id/, 'Patient messages must carry the authenticated sender profile.');
assert.match(portal, /setPortalDataError\('Payment status could not be loaded/, 'Portal payment data failures must be visible instead of appearing as an empty balance history.');
assert.match(portal, /submittingAppointment[\s\S]*?Request sent and visible in the appointment queue/, 'Appointment requests must prevent repeat submissions and preserve success if the secondary chat notification fails.');
assert.match(portal, /setMessageError\('Messages could not be loaded/, 'Patient messaging read failures must be visible.');
assert.match(portal, /setCheckoutMessage\('Secure checkout could not be started/, 'Patient checkout failures must be handled and shown without exposing backend errors.');
assert.match(operations, /const refreshRefundQueue = async[\s\S]*?queue could not be refreshed/, 'Refund actions must preserve their saved result when the follow-up queue read fails.');
assert.match(operations, /const refreshDisputes = async[\s\S]*?dispute queue could not be refreshed/, 'Dispute updates must report queue refresh failures instead of showing stale state as current.');
assert.match(authorization, /can_manage_patient_table/, 'Clinical write permissions must be table and role specific.');
assert.match(authorization, /when 'prescriptions' then public\.has_any_role\(array\['super_admin','doctor','specialist'\]\)/, 'Specialists must receive the scoped prescribing write permission already granted to their role.');
assert.match(authorization, /when 'encounters' then public\.has_any_role\(array\['super_admin','doctor','nurse','specialist'\]\)/, 'Specialist encounter authoring must be enabled at the base role gate and still pass department RLS.');
assert.match(hospitalWorkflows, /clinical manage encounters" on public\.encounters for all[\s\S]*?\['super_admin','doctor','nurse','specialist'\]/, 'Specialists with scoped grants must be allowed through the encounter workflow policy.');
assert.match(hospitalWorkflows, /staff record encounter workflow" on public\.encounter_workflow_events for insert[\s\S]*?\['super_admin','records_officer','receptionist','doctor','nurse','specialist'\]/, 'Specialist encounter events must be insertable for authenticated actors.');
assert.match(specialistAuthoring, /clinical manage result acknowledgements" on public\.result_acknowledgements for all[\s\S]*?\['super_admin','doctor','nurse','specialist'\]/, 'Specialists with scoped result.acknowledge grants must be able to acknowledge results.');
assert.match(specialistAuthoring, /clinical read result acknowledgements" on public\.result_acknowledgements for select[\s\S]*?\['super_admin','doctor','nurse','specialist'\]/, 'Specialists must be able to load result acknowledgements within their assigned department.');
assert.match(authorization, /'profiles','notifications','audit_logs','patient_messages','medication_refill_requests'/, 'Final authorization must reset every inherited sensitive-table policy.');
assert.match(authorization, /profiles_role_allowed/, 'Profile roles must be constrained at the database layer.');
assert.match(authorization, /billing_amounts_nonnegative/, 'Billing totals must reject negative values.');
assert.match(authorization, /care team upload patient documents/, 'Document storage writes must match care-team document permissions.');
assert.match(authorization, /drop policy if exists "care team upload patient documents" on storage\.objects;/, 'Storage upload policies must be replaceable when the authorization migration is rerun.');
assert.match(authorization, /drop policy if exists "care team delete patient documents" on storage\.objects;/, 'Storage delete policies must be replaceable when the authorization migration is rerun.');
assert.match(diagnostics, /Overall result assessment/, 'Laboratory results must support normal, abnormal, and critical assessments.');
assert.match(diagnostics, /Finalize Report/, 'Radiology must provide a report-entry workflow before finalization.');
assert.match(diagnostics, /data=\{labOrders\.filter\(\(row\) => hasRecordedLabResults\(row\.results\)\)\}/, 'The laboratory Results tab must display saved results independently of the order status label.');
assert.match(diagnostics, /emptyMessage="No laboratory results have been entered yet\./, 'An empty laboratory Results tab must explain how results appear.');
assert.match(diagnostics, /Array\.isArray\(row\.results\.values\) \? row\.results\.values : \[\]/, 'Legacy or partial result payloads must not crash the laboratory results table.');
assert.match(quality, /update of status, result_status, responsible_clinician_id/, 'Final lab results must queue acknowledgement when status changes.');
assert.match(quality, /update of status, report_status, responsible_clinician_id/, 'Final radiology reports must queue acknowledgement when status changes.');
assert.match(diagnostics, /responsible_clinician_id: payload\.doctorId/, 'New laboratory orders must persist the responsible clinician used for result routing.');
assert.match(criticalLabMigration, /jsonb_array_elements\(new\.results->'values'\)/, 'Critical lab result alerts must recognize structured critical result flags.');
assert.match(criticalLabMigration, /public\.notifications\(user_id, type, title, message, priority\)/, 'Critical finalized lab results must create an in-app notification.');
assert.match(criticalLabMigration, /new\.result_status not in \('final', 'corrected'\)/, 'Only finalized or corrected critical results should alert.');
assert.match(criticalLabMigration, /status = 'unacknowledged', due_at = excluded\.due_at/, 'Corrected results must reopen acknowledgement tracking.');
assert.match(criticalLabMigration, /p\.role::text = 'super_admin' and p\.status::text = 'active'/, 'Unassigned legacy critical results must alert active Super Admins for assignment.');
assert.match(criticalLabMigration, /after insert or update on public\.lab_orders/, 'Result changes must trigger alerts and acknowledgement updates.');
assert.match(criticalLabMigration, /meaningful_change := new\.status is distinct from old\.status[\s\S]*?new\.results is distinct from old\.results/, 'The acknowledgement queue must reopen only when clinically relevant result fields change.');
assert.match(organizationTest, /select plan\(54\)/, 'The database suite must include the critical-result assertions in its expected plan.');
assert.match(organizationTest, /correcting a finalized result reopens its acknowledgement task/, 'The database suite must cover acknowledgement reset on result correction.');
assert.match(organizationTest, /unassigned legacy critical result alerts active Super Admin/, 'The database suite must cover the unassigned critical-result fallback.');
assert.match(system, /resourceType: 'Bundle', type: 'collection'/, 'Patient export must use a FHIR collection bundle.');
assert.match(system, /fhir_version: '4\.0\.1'/, 'FHIR exports must record the FHIR R4 version.');
assert.match(system, /user\?\.role !== 'super_admin'/, 'FHIR export must match the database export-audit authorization.');
assert.match(system, /recordComplianceExport/, 'FHIR exports must be audited before download.');
assert.match(patients, /sameNameAndBirthDate/, 'Registration must warn about likely duplicate patient records.');
assert.match(patients, /samePhone/, 'Registration duplicate matching must compare normalized phone numbers.');
assert.match(patients, /randomUUID\(\)\.replaceAll\('-', ''\)\.slice\(0, 16\)/, 'Generated patient numbers must have enough entropy to avoid routine unique-key collisions.');
assert.match(patients, /Patient registration failed:[\s\S]*?finally\s*\{\s*setSaving\(false\)/, 'Network failures during registration must report failure and release the saving state.');
assert.match(patients, /Patient demographics update failed:[\s\S]*?finally\s*\{\s*setSaving\(false\)/, 'Network failures during demographic updates must report failure and release the saving state.');
assert.match(patients, /from\('patient_access_logs'\)\.insert/, 'Opening a patient chart must write an access log before displaying it.');
assert.match(patients, /\['PGRST202', 'PGRST205'\]/, 'Missing access-log API objects must not block charts already authorized by row-level security.');
assert.match(patients, /the read was not logged/, 'Access-log API failures must remain visible to the user.');
assert.match(patients, /uploadPatientDocument/, 'Patient charts must support the persisted document upload workflow.');
assert.match(safeCore, /create trigger stamp_patient_access_log before insert/, 'Patient-access actor and timestamp must be stamped by the database.');
assert.match(safeCore, /create policy "authorized users log patient access" on public\.patient_access_logs for insert/, 'Patient-access log inserts must be authorized by row-level security.');
assert.match(safeCore, /revoke update, delete, truncate, references, trigger on public\.patient_access_logs from authenticated/, 'Authenticated clients must not alter or delete access logs.');
assert.match(safeCore, /notify pgrst, 'reload schema'/, 'Migration must refresh the PostgREST schema cache after its schema changes.');
assert.match(app, /records: \(\) => <RecordsModule \/>/, 'The Records screen must be registered as a separate module.');
assert.match(auth, /match && match\.permissions/, 'Module access must honor the saved role permission matrix.');
assert.doesNotMatch(auth, /normalizedRole === 'records_officer'\) return/, 'HIM module access must remain configurable instead of being hardcoded.');
assert.match(system, /role: 'Health Information Management Officer',[\s\S]*?records: true/, 'The administrator permission matrix must enable HIM for its staff role.');
assert.match(layout, /records_officer:[\s\S]*?id: 'records', label: 'Health Information Management \(HIM\)'/, 'Records Officers must have a Health Information Management navigation item.');
assert.match(people, /'records_officer'/, 'Administrators must be able to select and manage Records Officers.');
assert.match(staffFunction, /requesterProfile\?\.status !== 'active'/, 'Staff creation must require an active administrator.');
assert.match(staffFunction, /'records_officer'/, 'The staff provisioning endpoint must accept the Records Officer role.');
assert.match(staffFunction, /status: 'active'/, 'New Records Officer accounts must be activated during provisioning.');
assert.match(authorization, /role::text in \([^\n]*'records_officer'/, 'The profile role constraint must accept Records Officers.');
assert.match(roleMigration, /'accountant','records_officer',[\s\S]*?'patient','unassigned'/, 'Legacy role enums must include supported staff roles and the quarantined unassigned role.');
assert.match(pendingAuthMigration, /'unassigned','pending'/, 'New Auth identities must be quarantined until trusted provisioning activates them.');
assert.match(pendingAuthMigration, /as restrictive for all to authenticated/, 'Pending profiles must be denied by restrictive table policies.');
assert.match(localAuthConfig, /enable_signup = false[\s\S]*?\[auth\.email\][\s\S]*?enable_signup = false[\s\S]*?enable_confirmations = true[\s\S]*?secure_password_change = true/, 'Local Auth must disable signup and require confirmation and secure password changes.');
assert.match(pendingAuthTest, /cannot read patient rows[\s\S]*?cannot write patient rows[\s\S]*?cannot read storage objects[\s\S]*?cannot use a privileged RPC/, 'Database regression coverage must deny pending users table, storage, and RPC access.');
assert.match(financialFacilityMigration, /update public\.billing b set facility_id=p\.home_facility_id[\s\S]*?create or replace function public\.set_financial_scope_from_patient/, 'Financial facilities must be backfilled from patient records and derived on insert.');
assert.match(financialFacilityMigration, /create policy %I on public\.%I as restrictive for select to authenticated/, 'Financial records must have restrictive facility-scoped read policies.');
assert.match(financialFacilityMigration, /using \(public\.has_any_role\(array\[''super_admin''\]\)\)/, 'Financial record deletes must remain Super Admin only.');
assert.match(authorization, /or public\.has_any_role\(array\['records_officer'\]\)/, 'Records Officers must have read-only clinical chart access.');
assert.match(hospitalWorkflows, /HIM register encounters/, 'HIM staff must be able to open an encounter in its initial state.');
assert.match(hospitalWorkflows, /drop policy if exists "authorized clinical read encounters" on public\.encounters/, 'Encounter authorization policies must be replaceable when the workflow migration is rerun.');
assert.match(hospitalWorkflows, /prevent_encounter_workflow_event_mutation/, 'Encounter workflow history must be append-only.');
assert.match(hospitalWorkflows, /guard_death_assessment_authority/, 'BID/BOD assessment changes must be restricted to authorized clinicians.');
assert.match(hospitalWorkflows, /death_assessment_status = 'assessment_required'/, 'BID/BOD registration must not mark death as confirmed.');
assert.match(workflowCompletion, /create table if not exists public\.family_cards/, 'HIM must have persisted family cards.');
assert.match(workflowCompletion, /create table if not exists public\.insurance_memberships/, 'Insurance membership must be stored per patient.');
assert.match(workflowCompletion, /pending_manual/, 'Insurance verification must remain explicit and manual when no payer integration exists.');
assert.match(workflowCompletion, /request_inpatient_admission/, 'Clinicians must be able to submit an inpatient admission request.');
assert.match(workflowCompletion, /allocate_requested_admission/, 'Ward staff must allocate requested beds through a server operation.');
assert.match(workflowCompletion, /revoke all on function public\.allocate_admission_bed\(uuid,uuid,uuid,uuid,text,text,text\) from public, anon, authenticated/, 'The legacy direct bed allocation RPC must remain unavailable.');
assert.match(workflowCompletion, /for update/, 'Bed allocation must lock records to prevent double allocation.');
assert.match(workflowCompletion, /register_unidentified_emergency/, 'Unidentified emergency intake must use a temporary patient identifier.');
assert.match(workflowCompletion, /merge_unidentified_patient/, 'Temporary patient identity must be linkable to a permanent record.');
assert.match(workflowCompletion, /guard_surgery_workflow/, 'Surgery transitions must enforce clinical documentation requirements.');
assert.match(workflowCompletion, /guard_lab_result_verification/, 'Lab results must be verified before they are final.');
assert.doesNotMatch(workflowCompletion, /drop table|truncate table|delete from public\.patients/i, 'Workflow migrations must preserve existing patient data.');
assert.match(records, /Patient Journey/, 'Authorized patient charts must show a patient journey timeline.');
assert.match(safeCore, /create policy "records officers read patient documents" on storage\.objects for select/, 'Records Officers must be able to read private chart attachments.');
assert.doesNotMatch(safeCore, /records officers read patient documents" on storage\.objects for (insert|update|delete)/, 'Records Officers must not upload, update, or delete chart attachments.');
assert.match(records, /purpose: 'records_module'/, 'Opening a chart in Records must be audited.');
assert.match(records, /purpose: 'records_document'/, 'Opening a private document from Records must be audited.');
assert.match(records, /createDocumentUrl\(document\.fileUrl\)/, 'Records must open private attachments through short-lived signed URLs.');
assert.match(organization, /create table if not exists public\.organization_units/, 'Hospital departments and units must be configurable data.');
assert.match(organization, /guard_organization_unit_tree/, 'Organization hierarchy must reject cycles and cross-facility parents.');
assert.match(organization, /create table if not exists public\.staff_organization_memberships/, 'Staff department assignments must be effective-dated records.');
assert.match(organization, /create or replace function public\.has_org_permission/, 'The database must expose an explicit scoped permission check.');
assert.match(organization, /audit_organization_change/, 'Organization and permission changes must be audited.');
assert.match(organizationUi, /const OrganizationModule = /, 'Administrators must have a persisted organization management screen.');
assert.match(organizationTest, /facility scope denies access to another facility/, 'Database tests must check cross-facility permission denial.');
assert.match(organizationTest, /non-admin cannot modify organization structure/, 'Database tests must check non-admin write denial.');
assert.match(finance, /submit_payment_for_approval/, 'Payment submission must be transactional and idempotent.');
assert.match(finance, /reviewed_by=actor_profile/, 'Payment reviews must record the profile ID.');
assert.match(finance, /payment_reversals/, 'Refund approvals must produce immutable reversal records.');
assert.match(operations, /submit_payment_for_approval/, 'Billing UI must use the idempotent payment RPC.');
assert.match(operations, /review_billing_refund/, 'Accounts users must have a persisted refund review workflow.');
assert.match(financeTest, /payment posting/, 'Database integration tests must verify payment posting.');
assert.match(clinicalRls, /as restrictive for select/, 'Department permission must restrict existing permissive clinical read policies.');
assert.match(clinicalRls, /has_clinical_department_permission/, 'Clinical RLS must enforce department membership and scoped grants.');
assert.match(clinicalRls, /'care_plan_goals','careplan.manage'/, 'Child care-plan rows must inherit patient and department scope.');
assert.match(clinicalRetention, /as restrictive for delete to authenticated using \(false\)/, 'Authenticated clients must not hard-delete clinical records through the Data API.');
assert.match(clinicalRetention, /set_config\('lock_timeout', '2s', true\)/, 'Clinical policy DDL must fail quickly rather than wait behind long-running transactions.');
assert.match(clinicalRetentionRollback, /has_clinical_department_permission/, 'The prepared rollback must restore the previous department-scoped delete policy.');
assert.match(clinicalRetentionPlan, /Status: written before migration execution/, 'The rollback plan must be documented before any migration execution.');
assert.match(clinicalRetentionPlan, /Rollback procedure/, 'The retention migration must have a documented rollback procedure.');
assert.match(stagingConfig, /project_id = "medicore-staging"/, 'Migration staging must use a distinct local Supabase project ID.');
assert.match(stagingConfig, /port = 55422/, 'Migration staging must use isolated local database ports.');
assert.match(stagingGuide, /supabase --workdir infra\/supabase-staging db reset/, 'Staging instructions must apply migrations to the isolated project first.');
assert.match(clinicalRetention, /'encounter_workflow_events'[\s\S]*?'medication_reconciliations'[\s\S]*?'admissions'[\s\S]*?'surgeries'/, 'Clinical retention policy must cover clinical records, history, and inpatient/surgical workflows.');
assert.equal(await read('supabase/migrations/20261103000026_clinical_record_retention.sql'), clinicalRetention, 'Clinical record retention must be present in the ordered Supabase migration chain.');
for (const table of ['encounters', 'lab_orders', 'radiology_orders', 'prescriptions', 'vital_signs', 'consultations', 'patient_documents', 'immunizations', 'medication_administrations', 'patient_allergies', 'patient_conditions', 'medication_orders', 'care_plans', 'care_plan_goals', 'clinical_tasks', 'patient_consents', 'clinical_alerts', 'encounter_workflow_events', 'result_acknowledgements', 'medication_reconciliations', 'admissions', 'surgeries']) {
    assert.match(clinicalRls, new RegExp(`\\('${table}','`), `${table} must be included in department-scoped clinical RLS.`);
}
assert.equal(clinicalMigration, clinicalRls, 'Department authorization must be present in the ordered Supabase migrations.');
assert.match(financeTest, /denied outside their assigned department/, 'Database tests must assert cross-department clinical denial.');
assert.match(pharmacy, /has_clinical_department_permission\(prescription_row\.patient_id/, 'Pharmacy dispensing RPC must enforce department permission explicitly.');
assert.match(financeTest, /failed multi-item dispense rolls back earlier stock changes/, 'Database tests must check atomic rollback for multi-item dispensing.');

const [integrations, integrationWorker, integrationWebhook, integrationMigration, deploymentDocs, billingUi] = await Promise.all([
    read('supabase/migrations/20261026000022_external_finance_integrations.sql'),
    read('supabase/functions/integration-dispatch/index.ts'),
    read('supabase/functions/integration-webhook/index.ts'),
    read('supabase/migrations/20261026000022_external_finance_integrations.sql'),
    read('supabase/DEPLOYMENT.md'),
    read('src/js/modules/operations.js')
]);
assert.equal(integrationMigration, integrations, 'External finance contracts must be included in the ordered migration chain.');
assert.match(integrations, /has_finance_department_permission\(patient_id,'insurance\.submit'\)/, 'Finance integration table access must use facility and department permission checks.');
assert.match(integrations, /submit_insurance_claim/, 'Payer claims must be validated and queued through a database workflow.');
assert.match(integrations, /request_payment_checkout/, 'Gateway intents must be validated and idempotent.');
assert.match(integrations, /process_finance_integration_event/, 'Normalized external events must enter through the deduplicating inbox.');
assert.match(integrations, /prevent_journal_mutation/, 'Posted general-ledger entries must be immutable.');
assert.match(integrations, /claim_integration_outbox/, 'Connector delivery must use a leased durable outbox.');
assert.match(integrations, /payment\.posted/, 'Approved payments must create a general-ledger event.');
assert.match(integrations, /payer.remittance/, 'Payer remittances must be reviewed before invoice posting.');
assert.match(integrationWorker, /Idempotency-Key|idempotency-key/, 'Outbound connector calls must carry stable idempotency keys.');
assert.match(integrationWorker, /routes: Record<string, string>/, 'Connector URLs must not be chosen by untrusted webhook or database payloads.');
assert.match(integrationWebhook, /HMAC/, 'Provider webhooks must be authenticated with HMAC signatures.');
assert.match(integrationWebhook, /process_finance_integration_event/, 'Verified webhooks must call the server-side normalized event handler.');
assert.match(billingUi, /request_payment_checkout/, 'Billing must expose the secured external gateway checkout.');
assert.match(billingUi, /submit_insurance_claim/, 'Billing must submit claims through the payer workflow.');
assert.match(billingUi, /review_payer_remittance/, 'Accounts must review and post incoming payer remittances.');
assert.match(billingUi, /Posted general-ledger journal/, 'Authorized finance users must be able to inspect posted ledger entries.');
assert.doesNotMatch(billingUi, /handleAdvanceClaim/, 'Billing must not manually advance payer claim status.');
assert.match(deploymentDocs, /MEDICORE_CONNECTORS_JSON/, 'Deployment docs must describe connector configuration and secret handling.');
assert.match(financeTest, /provider webhook event IDs are idempotent/, 'Database integration tests must verify webhook deduplication.');
assert.match(financeTest, /balanced journal entries/, 'Database integration tests must verify double-entry ledger balance.');
assert.match(himRecords, /create table if not exists public\.medical_record_files/, 'HIM must use a dedicated file index linked to existing patient identities.');
assert.match(himRecords, /create table if not exists public\.medical_record_movement_events/, 'HIM file movements must retain an append-only history.');
assert.match(himRecords, /create or replace function public\.request_medical_record_file/, 'HIM file requests must persist through a backend transaction.');
assert.match(himRecords, /create or replace function public\.transition_medical_record_movement/, 'HIM file transitions must be handled by a permission-checked backend function.');
assert.match(himRecords, /has_org_permission\('records\.file\.manage',patient_facility,null\)/, 'HIM file operations must enforce the patient facility boundary.');
assert.match(himRecords, /revoke all on public\.medical_record_files,public\.medical_record_movements,public\.medical_record_movement_events[\s\S]*?grant select on public\.medical_record_files/, 'Browser roles must not directly mutate medical file movements or history.');
assert.match(himRecords, /get_him_dashboard_summary/, 'HIM KPIs must come from a permission-scoped database aggregate.');
assert.equal(himMigration, himRecords, 'HIM records migration must be present in the ordered migration chain.');
assert.match(himRollback, /export medical_record_files, medical_record_movements,/, 'HIM rollback must require exporting operational tracking history.');
assert.match(records, /get_him_dashboard_summary[\s\S]*?request_medical_record_file[\s\S]*?transition_medical_record_movement/, 'HIM dashboard and file actions must call the persisted backend contracts.');
assert.match(records, /Movement history/, 'The HIM user interface must expose stored file movement history.');
assert.match(records, /from\('patients'\)[\s\S]*?\.range\(offset, offset \+ pageSize - 1\)/, 'The HIM patient dropdown must page through the authorized patient directory instead of relying on the shared one-page cache.');
assert.match(records, /Select label="Patient" value=\{fileRequest\.patientId\}[\s\S]*?patients\.map\(\(patient\)/, 'The physical file patient selector must list records fetched for the HIM directory.');
assert.match(app, /mobileOpen=\{sidebarOpen\}/, 'The mobile navigation drawer must be controlled by app state.');
assert.match(layout, /aria-expanded=\{menuOpen\}/, 'The mobile menu control must expose its expanded state.');
assert.match(styles, /@media \(max-width: 1023px\)[\s\S]*?\.mobile-drawer\.is-open/, 'Tablet and mobile widths must use a navigable drawer.');
assert.match(styles, /@media \(max-width: 480px\)[\s\S]*?data-label/, 'Narrow-screen tables must expose responsive row labels.');
assert.match(styles, /app-main \.truncate[\s\S]*?text-overflow: clip/, 'Clinical and billing copy must not be hidden behind truncation utilities.');
assert.match(styles, /-webkit-overflow-scrolling: touch[\s\S]*?scroll-behavior: smooth/, 'Horizontal data regions must support smooth touch and programmatic scrolling.');
assert.match(styles, /overflow-wrap: break-word; word-break: normal/, 'Long prose must wrap at sensible word boundaries.');
assert.doesNotMatch(styles, /body\s*\{[^}]*overflow-x:\s*(?:hidden|clip)/, 'The page must not mask horizontal layout defects by clipping body overflow.');
assert.match(system, /Role-Permission Matrix[\s\S]*?width: '14rem'[\s\S]*?width: '8\.5rem'/, 'The role matrix must have deliberate role and permission column widths.');
assert.match(system, /permission-checkbox[\s\S]*?aria-label=\{`\$\{row\.role\}: \$\{department\.label\}`\}/, 'Permission controls must remain individually labelled.');
assert.match(system, /className="role-permission-scroll"[\s\S]*?scrollLabel=/, 'The role matrix must remain a labelled horizontal-scroll table on narrow screens.');
assert.match(ui, /<colgroup>[\s\S]*?col\.width[\s\S]*?scope="col"/, 'Shared data tables must support explicit column sizing and semantic headings.');
assert.match(styles, /prefers-reduced-motion: reduce/, 'Motion must respect the reduced-motion preference.');
assert.match(styles, /@supports \(backdrop-filter: blur\(1px\)\)/, 'Glass surfaces must be progressively enhanced.');
assert.match(auth, /autoComplete="current-password"/, 'The login must support password managers.');
assert.match(auth, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/, 'Password visibility must have an accessible control name.');
assert.match(ui, /aria-modal="true"/, 'Dialogs must expose modal semantics.');
assert.match(ui, /handleDialogKeys/, 'Dialogs must keep keyboard focus within the open dialog.');
assert.match(auth, /onemed:session-expiring/, 'Configured idle sessions must warn users before sign-out.');
assert.match(auth, /onemed_last_activity_/, 'Idle activity must be coordinated across open browser tabs.');
assert.match(patients, /canUploadPatientDocument = \['super_admin', 'doctor', 'nurse'\]/, 'Document upload controls must match database-authorized writer roles.');

const documentStorageScope = await read('supabase/migrations/20261103000024_document_storage_scope.sql');
assert.match(documentStorageScope, /has_clinical_department_permission\(patient\.id, null, 'patient\.read', true\)/, 'Storage reads must inherit patient and department read authorization.');
assert.match(documentStorageScope, /has_clinical_department_permission\(patient\.id, null, 'document\.manage', false\)/, 'Storage writes must require scoped document permissions.');
assert.match(documentStorageScope, /file_size_limit, allowed_mime_types/, 'Patient documents must enforce bucket-level MIME and size limits.');

const labVisibility = await read('supabase/migrations/20261111000031_lab_result_patient_visibility.sql');
const labVisibilityMigration = await read('supabase/migrations/20261111000031_lab_result_patient_visibility.sql');
const labVisibilityRollback = await read('supabase/rollback/20261111000031_lab_result_patient_visibility.sql');
assert.match(labVisibilityMigration, /set local lock_timeout\s*=\s*'2s'/, 'Lab visibility migration must bound lock acquisition.');
assert.match(labVisibilityMigration, /as restrictive for select to authenticated using[\s\S]*?result_status in \('final', 'corrected'\)/, 'Patients must not read unfinalized laboratory results through the Data API.');
assert.match(labVisibilityRollback, /drop policy if exists "patients read finalized lab results"/, 'The lab visibility migration must have a matching rollback.');
assert.doesNotMatch(labVisibilityRollback, /delete from|truncate|drop table/i, 'Lab visibility rollback must preserve clinical result data.');
assert.match(stagingGuide, /applies every ordered migration in `supabase\/migrations\//, 'Staging instructions must track the complete timestamped migration directory.');
assert.match(deploymentDocs, /migrations\/20261111000031_lab_result_patient_visibility\.sql/, 'Deployment documentation must describe the lab visibility migration.');
assert.match(deploymentDocs, /migrations\/20261111000031_lab_result_patient_visibility\.sql` limits patient reads/, 'Deployment instructions must document lab visibility rollout.');
assert.match(deploymentDocs, /migrations\/20261112000032_critical_lab_in_app_alerts\.sql/, 'Deployment documentation must describe critical lab alerting.');

const patientPortalFunction = await read('supabase/functions/create-patient-portal/index.ts');
assert.match(patientPortalFunction, /if \(!url \|\| !anonKey \|\| !serviceKey\)/, 'Patient portal provisioning must fail clearly when required server secrets are absent.');
assert.match(patientPortalFunction, /linkedProfile, error: linkedProfileError/, 'Patient portal provisioning must not ignore profile lookup failures.');
assert.match(patientPortalFunction, /patientUpdateError[\s\S]*?deleteUser\(created\.user\.id\)/, 'Patient portal provisioning must clean up the newly created Auth account if email synchronization fails.');

console.log('Regression checks passed.');
