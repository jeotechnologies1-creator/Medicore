import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/\s/g, '').replace(/=+$/g, '')].map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

async function signIn(page, email, password) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.locator('#onemed-login-password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  const enrollment = page.getByRole('button', { name: /set up authenticator/i });
  if (await enrollment.isVisible().catch(() => false)) {
    await enrollment.click();
    const setup = await page.getByText(/Manual setup key:/).innerText();
    await page.getByLabel('Authenticator code').fill(totp(setup.split(':').at(-1).trim()));
    await page.getByRole('button', { name: 'Verify and continue' }).click();
  }
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 30000 });
}

async function installRetentionFixture(page, mode) {
  await page.evaluate(async ({ fixtureMode }) => {
    const authClient = window.OneMedSupabase.getClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    const { data: profile } = await authClient.from('profiles').select('id').eq('auth_user_id', authUser.id).single();
    const facilityId = 'a1000000-0000-4000-8000-000000000001';
    const patientId = 'a5000000-0000-4000-8000-000000000001';
    const actorId = profile.id;
    const isHeld = fixtureMode === 'held';
    const request = {
      id: `retention-${fixtureMode}`, facility_id: facilityId, patient_id: patientId, record_category: 'encounters', record_id: 'retention-test-record',
      action: 'dispose', reason: 'Approved retention term elapsed', status: isHeld ? 'blocked_by_legal_hold' : 'first_approved',
      requested_by: 'retention-requester', requested_at: '2026-11-16T10:00:00Z', first_approved_by: fixtureMode === 'primary' ? actorId : 'first-reviewer',
      second_approved_by: null, decision_note: isHeld ? 'Active legal hold.' : null
    };
    const fixture = {
      actorId, requests: [request], calls: [], archives: [], certificates: [],
      schedules: [{ id: 'schedule-1', facility_id: facilityId, record_category: 'encounters', retention_days: 365, retention_basis: 'Approved facility schedule', version: 1, active: true, approved: true, configured_by: 'configurer' }],
      holds: isHeld ? [{ id: 'hold-1', facility_id: facilityId, patient_id: patientId, record_category: 'encounters', case_reference: 'CASE-RET-1', reason: 'Pending litigation and preservation order', authority_basis: 'Court preservation order', placed_by: 'hold-officer', placed_at: '2026-11-15T10:00:00Z', status: 'active' }] : [],
      patients: [{ id: patientId, first_name: 'Test', last_name: 'Patient', patient_number: 'E2E-001', home_facility_id: facilityId }]
    };
    const rows = (table) => ({
      retention_schedule: fixture.schedules, legal_holds: fixture.holds, retention_action_requests: fixture.requests,
      record_archive_registry: fixture.archives, disposal_certificates: fixture.certificates, patients: fixture.patients
    }[table] || []);
    const makeQuery = (table) => {
      const filters = [];
      const query = {
        select: () => query, eq: (column, value) => { filters.push([column, value]); return query; },
        order: () => query, limit: () => query, range: () => query, in: () => query, or: () => query,
        insert: () => query, update: () => query, delete: () => query,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: fixture.patients[0], error: null }),
        then: (resolve, reject) => {
          const data = rows(table).filter((row) => filters.every(([column, value]) => row[column] === value));
          return Promise.resolve({ data, error: null, count: data.length }).then(resolve, reject);
        }
      };
      return query;
    };
    const mockedClient = {
      from: (table) => makeQuery(table),
      rpc: async (name, args) => {
        fixture.calls.push({ name, args });
        if (name === 'search_patient_directory') return { data: fixture.patients, error: null };
        if (name === 'approve_retention_disposal') fixture.requests[0].status = 'approved';
        if (name === 'execute_retention_action') {
          fixture.requests[0].status = 'executed';
          fixture.archives.push({ record_category: 'encounters', record_id: 'retention-test-record', facility_id: facilityId, patient_id: patientId, archive_state: 'sealed', recorded_at: new Date().toISOString(), state_note: 'Source retained and sealed.' });
          fixture.certificates.push({ id: 'certificate-1', record_category: 'encounters', record_id: 'retention-test-record', facility_id: facilityId, patient_id: patientId,
            schedule_version: 1, retention_basis: 'Approved facility schedule', first_approved_by: 'first-reviewer', second_approved_by: actorId,
            issued_at: new Date().toISOString(), legal_hold_clearance_at: new Date().toISOString(), record_fingerprint: 'a'.repeat(64) });
        }
        return { data: name === 'execute_retention_action' ? 'sealed' : name === 'approve_retention_disposal' ? 'approved' : [], error: null };
      }
    };
    window.__retentionFixture = fixture;
    window.OneMedSupabase = { getClient: () => mockedClient, getStatus: () => ({ configured: true, mode: 'supabase' }) };
  }, { fixtureMode: mode });
}

async function openRetentionPanel(page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'records' })));
  return page.getByRole('region', { name: 'Retention schedules and legal holds' });
}

test('a distinct second approver completes disposal and the certificate is visible', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_RELEASE_REVIEWER_EMAIL, process.env.CI_E2E_RELEASE_REVIEWER_PASSWORD);
  await installRetentionFixture(page, 'second-reviewer');
  const panel = await openRetentionPanel(page);
  const approve = panel.getByRole('button', { name: 'Approve disposal as second reviewer' });
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(panel.getByRole('status')).toContainText('Independent second disposal approval recorded.');
  await panel.getByRole('button', { name: 'Seal record and issue certificate' }).click();
  await expect(panel.getByRole('status')).toContainText('immutable disposal certificate issued');
  await expect(panel.getByText('Approved facility schedule')).toBeVisible();
  const calls = await page.evaluate(() => window.__retentionFixture.calls.map((call) => call.name).filter((name) => ['approve_retention_disposal', 'execute_retention_action'].includes(name)));
  expect(calls).toEqual(['approve_retention_disposal', 'execute_retention_action']);
});

test('the first approver cannot provide the second disposal approval', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_CODING_EMAIL, process.env.CI_E2E_CODING_PASSWORD);
  await installRetentionFixture(page, 'primary');
  const panel = await openRetentionPanel(page);
  await expect(panel.getByRole('button', { name: 'Approve disposal as second reviewer' })).toBeDisabled();
  await expect(panel.getByText(/second approval must come from someone other than the requester and first approver/i)).toBeVisible();
  const calls = await page.evaluate(() => window.__retentionFixture.calls.map((call) => call.name));
  expect(calls).not.toContain('approve_retention_disposal');
});

test('a record covered by an active legal hold cannot be disposed', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_RELEASE_REVIEWER_EMAIL, process.env.CI_E2E_RELEASE_REVIEWER_PASSWORD);
  await installRetentionFixture(page, 'held');
  const panel = await openRetentionPanel(page);
  await expect(panel.getByText(/blocked by active hold: CASE-RET-1/i)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Approve first step' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Approve disposal as second reviewer' })).toHaveCount(0);
  const calls = await page.evaluate(() => window.__retentionFixture.calls.map((call) => call.name));
  expect(calls).not.toContain('approve_retention_action');
  expect(calls).not.toContain('approve_retention_disposal');
  expect(calls).not.toContain('execute_retention_action');
});
