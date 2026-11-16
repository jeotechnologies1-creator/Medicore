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

async function installReleaseFixture(page, mode) {
  await page.evaluate(async ({ fixtureMode }) => {
    const authClient = window.OneMedSupabase.getClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    const { data: profile } = await authClient.from('profiles').select('id').eq('auth_user_id', authUser.id).single();
    const facilityId = 'a1000000-0000-4000-8000-000000000001';
    const patientId = 'a5000000-0000-4000-8000-000000000001';
    const actorId = profile.id;
    const request = fixtureMode === 'reviewer' ? {
      id: 'release-sensitive', facility_id: facilityId, patient_id: patientId, requester_name: 'Synthetic requester', requester_relationship: 'Parent',
      purpose: 'Continuity of care', requested_scope: ['demographics', 'encounters'], sensitive_scope: true, status: 'approved', received_by: 'intake-profile',
      identity_verified_by: 'identity-profile', approved_by: 'primary-approver', second_reviewed_by: null, authorization_basis: 'Signed authorization',
      received_at: '2026-11-16T10:00:00Z', redaction_notes: null
    } : fixtureMode === 'primary' ? {
      id: 'release-primary', facility_id: facilityId, patient_id: patientId, requester_name: 'Synthetic requester', requester_relationship: 'Parent',
      purpose: 'Continuity of care', requested_scope: ['demographics'], sensitive_scope: true, status: 'approved', received_by: 'intake-profile',
      identity_verified_by: 'identity-profile', approved_by: actorId, second_reviewed_by: null, authorization_basis: 'Signed authorization',
      received_at: '2026-11-16T10:00:00Z', redaction_notes: null
    } : {
      id: 'release-self', facility_id: facilityId, patient_id: patientId, requester_name: 'Synthetic requester', requester_relationship: 'Self',
      purpose: 'Personal records', requested_scope: ['demographics'], sensitive_scope: false, status: 'verified', received_by: actorId,
      identity_verified_by: actorId, approved_by: null, second_reviewed_by: null, authorization_basis: 'Verified identity',
      received_at: '2026-11-16T10:00:00Z', redaction_notes: null
    };
    const fixture = {
      actorId, requests: [request], disclosures: [], calls: [],
      patients: [{ id: patientId, first_name: 'Test', last_name: 'Patient', patient_number: 'E2E-001', home_facility_id: facilityId }]
    };
    const rows = (table) => ({
      release_information_requests: fixture.requests,
      disclosure_register: fixture.disclosures,
      data_subject_deadline_policies: [],
      data_subject_requests: [],
      patients: fixture.patients
    }[table] || []);
    const makeQuery = (table) => {
      const filters = [];
      const query = {
        select: () => query, eq: (column, value) => { filters.push([column, value]); return query; },
        order: () => query, limit: () => query, range: () => query, in: () => query,
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
        if (name === 'list_data_subject_request_queue') return { data: [], error: null };
        if (name === 'approve_release_information_request') {
          const row = fixture.requests.find((entry) => entry.id === args.p_request_id);
          if (args.p_second_review) row.second_reviewed_by = actorId;
          else { row.status = 'approved'; row.approved_by = actorId; }
        }
        if (name === 'release_information_request') {
          const row = fixture.requests.find((entry) => entry.id === args.p_request_id);
          row.status = 'released';
          fixture.disclosures.push({ id: 'disclosure-1', patient_id: row.patient_id, disclosed_to: row.requester_name, purpose: row.purpose,
            data_categories: args.p_released_scope, released_scope: args.p_released_scope, authority: row.authorization_basis,
            requester_relationship: row.requester_relationship, redaction_notes: args.p_redaction_notes, disclosed_at: new Date().toISOString() });
        }
        if (name === 'intake_release_information_request') fixture.calls.at(-1).args = args;
        return { data: ['intake_release_information_request', 'release_information_request'].includes(name) ? 'fixture-id' : [], error: null };
      }
    };
    window.__releaseFixture = fixture;
    window.OneMedSupabase = { getClient: () => mockedClient, getStatus: () => ({ configured: true, mode: 'supabase' }) };
  }, { fixtureMode: mode });
}

test('sensitive release requires an independent second approver and writes the disclosure register', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_RELEASE_REVIEWER_EMAIL, process.env.CI_E2E_RELEASE_REVIEWER_PASSWORD);
  await installReleaseFixture(page, 'reviewer');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'records' })));
  const panel = page.getByRole('region', { name: 'Release of information and privacy requests' });
  await expect(panel.getByRole('heading', { name: 'Release of information and privacy requests' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Second approval' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Second approval' }).click();
  await expect(panel.getByRole('status')).toContainText('Independent second review recorded.');
  await panel.getByRole('button', { name: 'Record release and disclosure' }).click();
  await expect(panel.getByRole('status')).toContainText('Release recorded in the disclosure register.');
  await expect(page.getByRole('table').getByText('Synthetic requester')).toBeVisible();
  const calls = await page.evaluate(() => window.__releaseFixture.calls.filter(({ name }) => ['approve_release_information_request', 'release_information_request'].includes(name)));
  expect(calls.map((call) => call.name)).toEqual(['approve_release_information_request', 'release_information_request']);
  expect(calls[0].args.p_second_review).toBe(true);
  expect(calls[1].args.p_released_scope).toEqual(['demographics', 'encounters']);
});

test('the staff member who received a request cannot approve it', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_CODING_EMAIL, process.env.CI_E2E_CODING_PASSWORD);
  await installReleaseFixture(page, 'requester');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'records' })));
  const panel = page.getByRole('region', { name: 'Release of information and privacy requests' });
  await expect(panel.getByRole('heading', { name: 'Release of information and privacy requests' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Approve release' })).toBeDisabled();
  await expect(panel.getByText(/staff member who received this request cannot approve it/i)).toBeVisible();
  const calls = await page.evaluate(() => window.__releaseFixture.calls.map((call) => call.name));
  expect(calls).not.toContain('approve_release_information_request');
});

test('the primary approver cannot provide the second approval', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_CODING_EMAIL, process.env.CI_E2E_CODING_PASSWORD);
  await installReleaseFixture(page, 'primary');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'records' })));
  const panel = page.getByRole('region', { name: 'Release of information and privacy requests' });
  await expect(panel.getByRole('button', { name: 'Second approval' })).toBeDisabled();
  await expect(panel.getByText(/second approver must differ from the intake staff member and first approver/i)).toBeVisible();
  const calls = await page.evaluate(() => window.__releaseFixture.calls.map((call) => call.name));
  expect(calls).not.toContain('approve_release_information_request');
});

test('records officer can intake a scoped release request', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_CODING_EMAIL, process.env.CI_E2E_CODING_PASSWORD);
  await installReleaseFixture(page, 'requester');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'records' })));
  const panel = page.getByRole('region', { name: 'Release of information and privacy requests' });
  await expect(panel.getByRole('heading', { name: 'Release of information and privacy requests' })).toBeVisible();
  await panel.getByLabel('Patient').selectOption('a5000000-0000-4000-8000-000000000001');
  await panel.getByLabel('Requester name').fill('Family representative');
  await panel.getByLabel('Requester relationship to patient').fill('Sibling');
  await panel.getByLabel('Purpose').fill('Continuity of care');
  await panel.getByLabel('Patient demographics').check();
  await panel.getByRole('button', { name: 'Receive request' }).click();
  await expect(panel.getByRole('status')).toContainText('Release request received and queued');
  const intake = await page.evaluate(() => window.__releaseFixture.calls.find((call) => call.name === 'intake_release_information_request'));
  expect(intake.args.p_scope).toEqual(['demographics']);
  expect(intake.args.p_relationship).toBe('Sibling');
});
