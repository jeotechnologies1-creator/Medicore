import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [app, core, auth, portal, supabaseClient, schema, diagnostics, quality, hardening, activation, authorization] = await Promise.all([
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
    read('supabase/role_authorization.sql')
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
assert.match(diagnostics, /Overall result assessment/, 'Laboratory results must support normal, abnormal, and critical assessments.');
assert.match(diagnostics, /Finalize Report/, 'Radiology must provide a report-entry workflow before finalization.');
assert.match(quality, /update of status, result_status, responsible_clinician_id/, 'Final lab results must queue acknowledgement when status changes.');
assert.match(quality, /update of status, report_status, responsible_clinician_id/, 'Final radiology reports must queue acknowledgement when status changes.');

console.log('Regression checks passed.');
