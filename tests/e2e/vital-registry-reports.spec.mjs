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

async function installVitalFixture(page) {
  await page.evaluate(async () => {
    const authClient = window.OneMedSupabase.getClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    const { data: profile } = await authClient.from('profiles').select('id').eq('auth_user_id', authUser.id).single();
    const facilityId = 'a1000000-0000-4000-8000-000000000001';
    const patientId = 'a5000000-0000-4000-8000-000000000001';
    const sampleDefinition = {
      id: 'sample-definition', facility_id: facilityId, report_key: 'sample.vital_events',
      report_name: 'ILLUSTRATIVE SAMPLE — verified vital event counts (not an official NHMIS mapping)', version: 1,
      definition: { measures: ['verified_birth_count', 'verified_death_count'], dimensions: [], mapping_status: 'illustrative_only' },
      official_mapping: false, active: true
    };
    const fixture = {
      facilityId, actorId: profile.id, patientId, births: [], deaths: [], definitions: [sampleDefinition], suppression: null, exports: [], calls: [],
      patients: [{ id: patientId, first_name: 'Test', last_name: 'Patient', patient_number: 'E2E-001', home_facility_id: facilityId }]
    };
    const rows = (table) => ({
      birth_registrations: fixture.births, death_registrations: fixture.deaths,
      statutory_report_definitions: fixture.definitions,
      statutory_report_suppression_rules: fixture.suppression ? [fixture.suppression] : [],
      statutory_report_exports: fixture.exports,
      patients: fixture.patients
    }[table] || []);
    const makeQuery = (table) => {
      const filters = [];
      const query = {
        select: () => query, eq: (column, value) => { filters.push([column, value]); return query; },
        order: () => query, limit: () => query, range: () => query, in: () => query, or: () => query,
        insert: () => query, update: () => query, delete: () => query,
        maybeSingle: () => Promise.resolve({ data: fixture.suppression, error: null }),
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
        if (name === 'register_birth') fixture.births.push({ id: 'birth-1', facility_id: fixture.facilityId, child_patient_id: args.p_child_patient_id, mother_patient_id: args.p_mother_patient_id, mother_encounter_id: args.p_mother_encounter_id, maternity_source_event_id: args.p_maternity_source_event_id, source_system: args.p_source_system, occurred_at: args.p_occurred_at, birth_outcome: args.p_birth_outcome, verification_status: 'pending', source_reference: args.p_source_reference });
        if (name === 'register_death') fixture.deaths.push({ id: 'death-1', facility_id: fixture.facilityId, patient_id: args.p_patient_id, encounter_id: args.p_encounter_id, source_system: args.p_source_system, occurred_at: args.p_occurred_at, verification_status: 'pending', source_reference: args.p_source_reference });
        if (name === 'verify_vital_registration') {
          const rowsToUpdate = args.p_record_type === 'birth' ? fixture.births : fixture.deaths;
          Object.assign(rowsToUpdate.find((row) => row.id === args.p_record_id), { verification_status: 'verified', source_verification_method: args.p_method, source_verification_notes: args.p_notes });
        }
        if (name === 'configure_statutory_report') {
          fixture.definitions.filter((row) => row.report_key === args.p_report_key).forEach((row) => { row.active = false; });
          fixture.definitions.push({ id: 'custom-definition', facility_id: fixture.facilityId, report_key: args.p_report_key, report_name: args.p_report_name, version: 1, definition: args.p_definition, official_mapping: args.p_official_mapping, active: true });
        }
        if (name === 'configure_statutory_small_cell_rule') fixture.suppression = args.p_minimum_cell_count == null ? null : { id: 'rule-1', facility_id: fixture.facilityId, minimum_cell_count: args.p_minimum_cell_count, policy_basis: args.p_policy_basis };
        if (name === 'aggregate_statutory_report') return { data: { report_key: 'custom.vitals', measures: [{ measure: 'verified_birth_count', value: null, suppressed: true }] }, error: null };
        if (name === 'export_statutory_report') fixture.exports.push({ id: 'export-1', facility_id: fixture.facilityId, report_definition_id: args.p_definition_id, report_version: 1, period_start: args.p_period_start, period_end: args.p_period_end, recipient: args.p_recipient, purpose: args.p_purpose, payload_sha256: 'b'.repeat(64), exported_at: new Date().toISOString() });
        return { data: ['register_birth', 'register_death', 'export_statutory_report'].includes(name) ? `${name}-id` : [], error: null };
      }
    };
    window.__vitalFixture = fixture;
    window.OneMedSupabase = { getClient: () => mockedClient, getStatus: () => ({ configured: true, mode: 'supabase' }) };
  });
}

async function openVitalPanel(page) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'records' })));
  return page.getByRole('region', { name: 'Birth, death, and statutory reporting' });
}

test('birth and death registrations are linked and source-verified', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_CODING_EMAIL, process.env.CI_E2E_CODING_PASSWORD);
  await installVitalFixture(page);
  const panel = await openVitalPanel(page);
  await panel.getByLabel('Child patient').selectOption('a5000000-0000-4000-8000-000000000001');
  await panel.getByLabel('Mother patient').selectOption('a5000000-0000-4000-8000-000000000001');
  await panel.getByLabel('Birth date and time').fill('2026-11-16T10:00');
  await panel.getByRole('button', { name: 'Register birth' }).click();
  await expect(panel.getByRole('status')).toContainText('Birth registration entered');
  await panel.getByLabel('Source verification method').first().fill('Maternity register cross-check');
  await panel.getByRole('button', { name: 'Verify birth source' }).click();
  await expect(panel.getByRole('status')).toContainText('Vital event source verified.');

  await panel.getByLabel('Patient', { exact: true }).selectOption('a5000000-0000-4000-8000-000000000001');
  await panel.getByLabel('Confirmed emergency encounter ID').fill('a2000000-0000-4000-8000-000000000001');
  await panel.getByLabel('Date and time of death').fill('2026-11-16T11:00');
  await panel.getByRole('button', { name: 'Register death' }).click();
  await expect(panel.getByRole('status')).toContainText('Death registration entered');
  await panel.getByLabel('Source verification method').last().fill('Confirmed BID encounter review');
  await panel.getByRole('button', { name: 'Verify death source' }).click();
  await expect(panel.getByRole('status')).toContainText('Vital event source verified.');
  const calls = await page.evaluate(() => window.__vitalFixture.calls.map(({ name, args }) => ({ name, args })).filter(({ name }) => ['register_birth', 'register_death', 'verify_vital_registration'].includes(name)));
  expect(calls.map((call) => call.name)).toEqual(['register_birth', 'verify_vital_registration', 'register_death', 'verify_vital_registration']);
  expect(calls[2].args.p_encounter_id).toBe('a2000000-0000-4000-8000-000000000001');
});

test('facility can configure suppression, generate a report, and log its export disclosure', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_CODING_EMAIL, process.env.CI_E2E_CODING_PASSWORD);
  await installVitalFixture(page);
  const panel = await openVitalPanel(page);
  await panel.getByLabel('Report key').fill('facility.vital.events');
  await panel.getByLabel('Report name').fill('Facility vital event aggregate');
  await panel.getByLabel('Verified birth count').check();
  await panel.getByRole('button', { name: 'Save report definition version' }).click();
  await expect(panel.getByRole('status')).toContainText('new versioned report definition');

  await panel.getByLabel('Minimum cell count').fill('5');
  await panel.getByLabel('Policy basis').fill('Facility-approved privacy suppression policy');
  await panel.getByRole('button', { name: 'Save suppression rule' }).click();
  await expect(panel.getByText(/cells below 5 are suppressed/)).toBeVisible();

  await panel.getByLabel('Active report definition').selectOption('custom-definition');
  await panel.getByLabel('Period start').fill('2026-11-01');
  await panel.getByLabel('Period end').fill('2026-11-30');
  await panel.getByRole('button', { name: 'Generate aggregate report' }).click();
  await expect(panel.getByText(/"suppressed": true/)).toBeVisible();
  await panel.getByLabel('Export recipient').fill('District HMIS office');
  await panel.getByLabel('Export purpose').fill('Monthly statutory aggregate reporting');
  await panel.getByRole('button', { name: 'Export and log disclosure' }).click();
  await expect(panel.getByRole('status')).toContainText('audited statutory export disclosure log');
  await expect(panel.getByText('District HMIS office')).toBeVisible();
  const calls = await page.evaluate(() => window.__vitalFixture.calls.map((call) => call.name));
  expect(calls).toContain('configure_statutory_report');
  expect(calls).toContain('configure_statutory_small_cell_rule');
  expect(calls).toContain('aggregate_statutory_report');
  expect(calls).toContain('export_statutory_report');
});
