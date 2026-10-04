import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [app, core, auth, portal, supabaseClient, schema, diagnostics, quality, hardening, activation, authorization, system, patients, safeCore, records, layout, people, staffFunction, legacyRoles] = await Promise.all([
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
    read('supabase/legacy_role_enum_compatibility.sql')
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
assert.match(auth, /records_officer: \['dashboard', 'records'\]/, 'Records Officers must default to the Records module only.');
assert.match(system, /role: 'Records Officer',[\s\S]*?records: true/, 'The administrator permission matrix must enable Records for its staff role.');
assert.match(layout, /records_officer:[\s\S]*?id: 'records', label: 'Records'/, 'Records Officers must have a Records navigation item.');
assert.match(people, /'records_officer'/, 'Administrators must be able to select and manage Records Officers.');
assert.match(staffFunction, /requesterProfile\?\.status !== 'active'/, 'Staff creation must require an active administrator.');
assert.match(staffFunction, /'records_officer'/, 'The staff provisioning endpoint must accept the Records Officer role.');
assert.match(staffFunction, /status: 'active'/, 'New Records Officer accounts must be activated during provisioning.');
assert.match(authorization, /role::text in \([^\n]*'records_officer'/, 'The profile role constraint must accept Records Officers.');
assert.match(legacyRoles, /'accountant','records_officer','patient'/, 'Legacy role enums must be upgraded before Records Officers are created.');
assert.match(authorization, /or public\.has_any_role\(array\['records_officer'\]\)/, 'Records Officers must have read-only clinical chart access.');
assert.match(safeCore, /create policy "records officers read patient documents" on storage\.objects for select/, 'Records Officers must be able to read private chart attachments.');
assert.doesNotMatch(safeCore, /records officers read patient documents" on storage\.objects for (insert|update|delete)/, 'Records Officers must not upload, update, or delete chart attachments.');
assert.match(records, /purpose: 'records_module'/, 'Opening a chart in Records must be audited.');
assert.match(records, /purpose: 'records_document'/, 'Opening a private document from Records must be audited.');
assert.match(records, /createDocumentUrl\(document\.fileUrl\)/, 'Records must open private attachments through short-lived signed URLs.');

console.log('Regression checks passed.');
