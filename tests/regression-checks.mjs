import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [app, core, auth, portal, supabaseClient, schema, diagnostics, quality, hardening, activation, authorization, system, patients, safeCore, records, layout, people, staffFunction, legacyRoles, hospitalWorkflows, workflowCompletion, organization, organizationUi, organizationTest, finance, financeTest, operations, clinicalRls, clinicalMigration, pharmacy, styles, ui] = await Promise.all([
    read('src/app.js'),
    read('src/js/core.js'),
    read('src/js/auth.js'),
    read('src/js/modules/portal.js'),
    read('src/supabase.js'),
    read('supabase/schema.sql'),
    read('src/js/modules/diagnostics.js'),
    read('supabase/quality_safety_upgrade.sql'),
    read('supabase/production_hardening.sql'),
    read('supabase/app_activation.sql'),
    read('supabase/role_authorization.sql'),
    read('src/js/modules/system.js'),
    read('src/js/modules/patients.js'),
    read('supabase/safe_core_multibranch.sql'),
    read('src/js/modules/records.js'),
    read('src/js/layout.js'),
    read('src/js/modules/people.js'),
    read('supabase/functions/create-staff/index.ts'),
    read('supabase/legacy_role_enum_compatibility.sql'),
    read('supabase/hospital_workflows.sql'),
    read('supabase/workflow_completion.sql'),
    read('supabase/organization_permissions.sql'),
    read('src/js/modules/system.js'),
    read('supabase/tests/core_workflows.test.sql'),
    read('supabase/finance_posting_refunds.sql'),
    read('supabase/tests/core_workflows.test.sql'),
    read('src/js/modules/operations.js'),
    read('supabase/clinical_department_rls.sql'),
    read('supabase/migrations/20261026000021_clinical_department_rls.sql'),
    read('supabase/atomic_pharmacy_dispensing.sql'),
    read('src/styles.css'),
    read('src/js/ui.js')
]);

assert.equal(/setInterval\s*\(/.test(app), false, 'The app must not poll or refresh records in the background.');
assert.match(app, /persistNotificationReadState/, 'Notification read changes must be persisted.');
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
assert.doesNotMatch(auth, /roleBasedAccess === false\) return true/, 'Browser settings must not disable module access checks.');
assert.doesNotMatch(auth, /savedLocal\.length/, 'Browser-local role matrices must not override the server-saved access policy.');
assert.match(supabaseClient, /data\?\.status === 'active'/, 'Password login must reject inactive profiles.');
assert.match(portal, /sender_profile_id: user\.id/, 'Patient messages must carry the authenticated sender profile.');
assert.match(authorization, /can_manage_patient_table/, 'Clinical write permissions must be table and role specific.');
assert.match(authorization, /'profiles','notifications','audit_logs','patient_messages','medication_refill_requests'/, 'Final authorization must reset every inherited sensitive-table policy.');
assert.match(authorization, /profiles_role_allowed/, 'Profile roles must be constrained at the database layer.');
assert.match(authorization, /billing_amounts_nonnegative/, 'Billing totals must reject negative values.');
assert.match(authorization, /care team upload patient documents/, 'Document storage writes must match care-team document permissions.');
assert.match(authorization, /drop policy if exists "care team upload patient documents" on storage\.objects;/, 'Storage upload policies must be replaceable when the authorization migration is rerun.');
assert.match(authorization, /drop policy if exists "care team delete patient documents" on storage\.objects;/, 'Storage delete policies must be replaceable when the authorization migration is rerun.');
assert.match(diagnostics, /Overall result assessment/, 'Laboratory results must support normal, abnormal, and critical assessments.');
assert.match(diagnostics, /Finalize Report/, 'Radiology must provide a report-entry workflow before finalization.');
assert.match(quality, /update of status, result_status, responsible_clinician_id/, 'Final lab results must queue acknowledgement when status changes.');
assert.match(quality, /update of status, report_status, responsible_clinician_id/, 'Final radiology reports must queue acknowledgement when status changes.');
assert.match(system, /resourceType: 'Bundle', type: 'collection'/, 'Patient export must use a FHIR collection bundle.');
assert.match(system, /fhir_version: '4\.0\.1'/, 'FHIR exports must record the FHIR R4 version.');
assert.match(system, /user\?\.role !== 'super_admin'/, 'FHIR export must match the database export-audit authorization.');
assert.match(system, /recordComplianceExport/, 'FHIR exports must be audited before download.');
assert.match(patients, /sameNameAndBirthDate/, 'Registration must warn about likely duplicate patient records.');
assert.match(patients, /samePhone/, 'Registration duplicate matching must compare normalized phone numbers.');
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
assert.match(legacyRoles, /'accountant','records_officer','patient'/, 'Legacy role enums must be upgraded before Records Officers are created.');
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
for (const table of ['encounters', 'lab_orders', 'radiology_orders', 'prescriptions', 'vital_signs', 'consultations', 'patient_documents', 'immunizations', 'medication_administrations', 'patient_allergies', 'patient_conditions', 'medication_orders', 'care_plans', 'care_plan_goals', 'clinical_tasks', 'patient_consents', 'clinical_alerts', 'encounter_workflow_events', 'result_acknowledgements', 'medication_reconciliations', 'admissions', 'surgeries']) {
    assert.match(clinicalRls, new RegExp(`\\('${table}','`), `${table} must be included in department-scoped clinical RLS.`);
}
assert.equal(clinicalMigration, clinicalRls, 'Department authorization must be present in the ordered Supabase migrations.');
assert.match(financeTest, /denied outside their assigned department/, 'Database tests must assert cross-department clinical denial.');
assert.match(pharmacy, /has_clinical_department_permission\(prescription_row\.patient_id/, 'Pharmacy dispensing RPC must enforce department permission explicitly.');
assert.match(financeTest, /failed multi-item dispense rolls back earlier stock changes/, 'Database tests must check atomic rollback for multi-item dispensing.');

const [integrations, integrationWorker, integrationWebhook, integrationMigration, deploymentDocs, billingUi] = await Promise.all([
    read('supabase/external_finance_integrations.sql'),
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

console.log('Regression checks passed.');
