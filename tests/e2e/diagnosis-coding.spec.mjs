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

async function installCodingFixture(page, clinicianMode = false) {
  await page.evaluate((isClinician) => {
    const facilityId = 'a1000000-0000-4000-8000-000000000001';
    const encounterId = 'a2000000-0000-4000-8000-000000000001';
    const clinicianId = 'a3000000-0000-4000-8000-000000000001';
    const fixture = {
      codes: [], queries: isClinician ? [{ id: 'query-assigned', facility_id: facilityId, encounter_id: encounterId, clinician_id: clinicianId, question: 'Please confirm the documented clinical specificity.', status: 'open' }] : [], templates: [], deficiencies: [], rpcCalls: [],
      worklist: [{ admission_id: 'a4000000-0000-4000-8000-000000000001', encounter_id: encounterId, patient_id: 'a5000000-0000-4000-8000-000000000001', facility_id: facilityId, clinician_id: clinicianId, department: 'Medical', discharged_at: '2026-11-10T10:00:00Z', discharge_date: '2026-11-10', assigned_code_count: 0, open_query_count: 0, coding_status: 'uncoded' }],
      concepts: [{ system: 'ICD-10', code: 'J18.9', display: 'Pneumonia, unspecified organism', active: true }],
      systems: [{ code: 'ICD-10', name: 'International Classification of Diseases, 10th Revision', version: '2026', loaded_at: '2026-11-01T00:00:00Z' }],
      profiles: [{ id: clinicianId, full_name: 'Synthetic Clinician', role: 'doctor', department: 'Medical', facility_id: facilityId }]
    };
    const rowsFor = (table) => ({
      discharged_encounter_coding_worklist: fixture.worklist,
      chart_audit_templates: fixture.templates,
      chart_deficiencies: fixture.deficiencies,
      coding_completeness_by_department: [{ department: 'Medical', discharged_encounters: 1, coded_encounters: fixture.codes.length ? 1 : 0, encounters_with_open_queries: fixture.queries.filter((row) => row.status === 'open').length, completeness_percent: fixture.codes.length ? 100 : 0 }],
      chart_deficiency_compliance_by_department: [],
      profiles: fixture.profiles,
      code_systems: fixture.systems,
      concepts: fixture.concepts,
      encounter_diagnosis_codes: fixture.codes,
      coding_clinician_queries: fixture.queries,
      notifications: []
    }[table] || []);
    const makeQuery = (table) => {
      const filters = [];
      const query = {
        select: (_columns, options) => { query.options = options; return query; },
        eq: (column, value) => { filters.push(['eq', column, value]); return query; },
        ilike: (column, value) => { filters.push(['ilike', column, value]); return query; },
        in: () => query,
        order: () => query,
        limit: () => query,
        range: () => query,
        insert: () => query,
        update: () => query,
        delete: () => query,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        single: () => Promise.resolve({ data: null, error: null }),
        then: (resolve, reject) => {
          let data = rowsFor(table).filter((row) => filters.filter(([operation, column]) => operation === 'eq' && !(table === 'coding_clinician_queries' && column === 'clinician_id')).every(([, column, value]) => row[column] === value));
          const likeFilters = filters.filter(([, column]) => column === 'display' || column === 'code');
          if (table === 'concepts' && likeFilters.length) data = data.filter((row) => likeFilters.some(([operation, field, pattern]) => {
            if (operation !== 'ilike') return false;
            const needle = pattern.replaceAll('%', '').toLowerCase();
            return field === 'display' ? row.display.toLowerCase().includes(needle) : row.code.toLowerCase().startsWith(needle);
          }));
          const result = { data: query.options?.head ? null : data, error: null, count: table === 'concepts' ? fixture.concepts.length : data.length };
          return Promise.resolve(result).then(resolve, reject);
        }
      };
      return query;
    };
    const mockedClient = {
      from: (table) => makeQuery(table),
      rpc: async (name, args) => {
        fixture.rpcCalls.push({ name, args });
        if (name === 'assign_encounter_diagnosis') fixture.codes.push({ id: `code-${fixture.codes.length + 1}`, encounter_id: args.p_encounter_id, facility_id: facilityId, code_system: args.p_code_system, code: args.p_code, display_snapshot: fixture.concepts.find((row) => row.system === args.p_code_system && row.code === args.p_code)?.display, primary_diagnosis: args.p_primary, coding_status: 'assigned' });
        if (name === 'ask_coding_clinician_query') fixture.queries.push({ id: `query-${fixture.queries.length + 1}`, facility_id: facilityId, encounter_id: args.p_encounter_id, diagnosis_code_id: args.p_diagnosis_code_id, question: args.p_question, status: 'open', asked_at: new Date().toISOString() });
        if (name === 'respond_coding_clinician_query') fixture.queries = fixture.queries.filter((query) => query.id !== args.p_query_id);
        return { data: 'fixture-id', error: null };
      }
    };
    window.__codingFixture = fixture;
    window.OneMedSupabase = { getClient: () => mockedClient, getStatus: () => ({ configured: true, mode: 'supabase' }) };
  }, clinicianMode);
}

test('authorized coder assigns a loaded diagnosis and sends a clinician query', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_CODING_EMAIL, process.env.CI_E2E_CODING_PASSWORD);
  await installCodingFixture(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'records' })));
  await expect(page.getByRole('heading', { name: 'Diagnosis coding and chart audit' })).toBeVisible();
  await expect(page.getByLabel('Loaded code system')).toContainText('ICD-10');
  await page.getByLabel('Discharged encounter').first().selectOption('a2000000-0000-4000-8000-000000000001');
  await page.getByLabel('Search active diagnosis concepts').fill('pneumonia');
  await page.getByRole('button', { name: /Pneumonia, unspecified organism/ }).click();
  await page.getByRole('button', { name: 'Assign selected code' }).click();
  await expect(page.getByRole('status')).toContainText('Diagnosis code assigned from loaded terminology.');
  await page.getByLabel(/Question about Pneumonia/).fill('Please confirm the documented clinical specificity.');
  await page.getByRole('button', { name: 'Send query' }).click();
  await expect(page.getByRole('status')).toContainText('Clinician query sent.');
  const rpcCalls = await page.evaluate(() => window.__codingFixture.rpcCalls.map((call) => call.name));
  expect(rpcCalls).toEqual(['assign_encounter_diagnosis', 'ask_coding_clinician_query']);
});

test('assigned clinician can submit a response to a coding query', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_CLINICIAN_EMAIL, process.env.CI_E2E_CLINICIAN_PASSWORD);
  await installCodingFixture(page, true);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'consultations' })));
  await expect(page.getByRole('heading', { name: 'Queries assigned to you' })).toBeVisible();
  await page.getByLabel('Response to query query-as').fill('The record supports the documented diagnosis.');
  await page.getByRole('button', { name: 'Submit response' }).click();
  await expect(page.getByRole('status')).toContainText('Clinician response recorded.');
  const calls = await page.evaluate(() => window.__codingFixture.rpcCalls.map((call) => call.name));
  expect(calls).toEqual(['respond_coding_clinician_query']);
});

test('nurse is denied access to the records coding workspace', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_NURSE_EMAIL, process.env.CI_E2E_NURSE_PASSWORD);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'records' })));
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await expect(page.getByText(/Permission denied/)).toBeVisible();
});
