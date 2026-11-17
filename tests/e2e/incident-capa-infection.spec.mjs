import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/\s/g, '').replace(/=+$/g, '')].map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

async function signIn(page, email, password) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.locator('#onemed-login-password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  const setupButton = page.getByRole('button', { name: /set up authenticator/i });
  if (await setupButton.isVisible().catch(() => false)) {
    await setupButton.click();
    const setupText = await page.getByText(/Manual setup key:/).innerText();
    await page.getByLabel('Authenticator code').fill(totp(setupText.split(':').at(-1).trim()));
    await page.getByRole('button', { name: 'Verify and continue' }).click();
  }
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 30000 });
}

async function installSafetyFixture(page) {
  await page.evaluate(async () => {
    const authClient = window.OneMedSupabase.getClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    const { data: profile } = await authClient.from('profiles').select('id,role,facility_id').eq('auth_user_id', authUser.id).single();
    const fixture = {
      facility: 'a1000000-0000-4000-8000-000000000001', actor: profile.id, calls: [],
      severities: [{ id: 'severity-1', severity_key: 'moderate', display_label: 'Moderate', active: true, rank_order: 2 }],
      incidents: [], identities: [], investigations: [], actions: [], closures: [],
      profiles: [{ id: profile.id, full_name: 'Safety Test Lead', role: profile.role, facility_id: 'a1000000-0000-4000-8000-000000000001', status: 'active' }],
      cases: [], wards: [{ id: 'ward-1', name: 'Medical Ward', facility_id: 'a1000000-0000-4000-8000-000000000001' }]
    };
    const rowsFor = (table) => ({ incident_severity_scales: fixture.severities, safety_incidents: fixture.incidents, safety_incident_reporter_identity: fixture.identities, safety_incident_investigations: fixture.investigations, safety_incident_actions: fixture.actions, safety_incident_closures: fixture.closures, profiles: fixture.profiles, infection_surveillance_cases: fixture.cases, wards: fixture.wards }[table] || []);
    const client = {
      from: (table) => {
        const filters = [];
        const query = { select: () => query, eq: (key, value) => { filters.push([key, value]); return query; }, order: () => query,
          then: (resolve, reject) => Promise.resolve({ data: rowsFor(table).filter((row) => filters.every(([key, value]) => row[key] === value)), error: null }).then(resolve, reject) };
        return query;
      },
      rpc: async (name, args) => {
        fixture.calls.push({ name, args });
        if (name === 'report_safety_incident') {
          fixture.incidents.unshift({ id: 'incident-1', facility_id: fixture.facility, severity_id: 'severity-1', incident_type: args.p_incident_type, title: args.p_title, description: args.p_description, occurred_at: args.p_occurred_at, location: args.p_location, status: 'open' });
          fixture.identities.push({ incident_id: 'incident-1', reporter_profile_id: fixture.actor });
          return { data: 'incident-1', error: null };
        }
        if (name === 'investigate_safety_incident') {
          fixture.investigations = [{ id: 'investigation-1', incident_id: args.p_incident_id, facility_id: fixture.facility, findings: args.p_findings, root_cause: args.p_root_cause }];
          Object.assign(fixture.incidents.find((row) => row.id === args.p_incident_id), { status: 'investigating' });
        }
        if (name === 'add_safety_incident_action') fixture.actions.push({ id: 'action-1', incident_id: args.p_incident_id, facility_id: fixture.facility, action_type: args.p_type, description: args.p_description, owner_profile_id: args.p_owner, due_date: args.p_due_date, status: 'open' });
        if (name === 'update_safety_incident_action') Object.assign(fixture.actions.find((row) => row.id === args.p_action_id), { status: args.p_status });
        if (name === 'close_safety_incident') {
          fixture.closures.push({ id: 'closure-1', incident_id: args.p_incident_id, facility_id: fixture.facility, closure_summary: args.p_closure_summary, signed_at: new Date().toISOString() });
          Object.assign(fixture.incidents.find((row) => row.id === args.p_incident_id), { status: 'closed' });
        }
        if (name === 'record_infection_surveillance_case') fixture.cases.push({ id: 'case-1', facility_id: fixture.facility, ward_id: args.p_ward_id, case_category: args.p_category, classification: args.p_classification, onset_date: args.p_onset_date, status: args.p_status });
        if (name === 'get_ward_infection_trends') return { data: [{ ward_id: 'ward-1', ward_name: 'Medical Ward', case_category: 'HAI', case_count: 1 }], error: null };
        return { data: `${name}-id`, error: null };
      }
    };
    window.__safetyFixture = fixture;
    window.OneMedSupabase = { getClient: () => client, getStatus: () => ({ configured: true, mode: 'supabase' }) };
  });
}

test('safety lead reports, investigates, assigns and verifies CAPA, closes incidents, and reviews ward trends', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_CODING_EMAIL, process.env.CI_E2E_CODING_PASSWORD);
  await installSafetyFixture(page);
  await page.getByRole('button', { name: 'Safety & Infection Control' }).click();
  const safety = page.getByRole('region', { name: 'Confidential incident reporting and infection surveillance' });
  await safety.getByLabel('Severity').selectOption('moderate');
  await safety.getByLabel('Incident type').fill('Medication safety');
  await safety.getByLabel('Title').fill('Dose near miss');
  await safety.getByLabel('Location').fill('Medical Ward');
  await safety.getByLabel('Occurred at').fill('2026-11-17T09:30');
  await safety.getByLabel('Description').fill('A near miss was identified before medication reached the patient.');
  await safety.getByRole('button', { name: 'Submit confidential report' }).click();
  await expect(safety.getByRole('status')).toContainText('Confidential incident report submitted');
  const incident = safety.getByTestId('safety-incident-row').first();
  await expect(incident.getByText(/Identity withheld from this role/)).toBeVisible();

  await incident.getByLabel('Investigation findings').fill('Double-check step was omitted during handover.');
  await incident.getByLabel('Root cause').fill('Handover process gap');
  await incident.getByRole('button', { name: 'Save investigation' }).click();
  await expect(safety.getByRole('status')).toContainText('Investigation record saved');
  const actorId = await page.evaluate(() => window.__safetyFixture.actor);
  await incident.getByLabel('Owner').selectOption(actorId);
  await incident.getByLabel('Action description').fill('Add a medication handover read-back step.');
  await incident.getByLabel('Due date').fill('2026-12-01');
  await incident.getByRole('button', { name: 'Assign CAPA action' }).click();
  await expect(safety.getByRole('status')).toContainText('action assigned');
  await incident.getByRole('button', { name: 'Mark complete' }).click();
  await incident.getByRole('button', { name: 'Verify action' }).click();
  await incident.getByLabel('Closure summary and sign-off').fill('Investigation complete; corrective action verified by the safety lead.');
  await incident.getByRole('button', { name: 'Close incident after investigation and CAPA verification' }).click();
  await expect(safety.getByRole('status')).toContainText('closed with recorded sign-off');

  await safety.getByLabel('Ward').selectOption('ward-1');
  await safety.getByLabel('Case category').fill('HAI');
  await safety.getByLabel('Classification').fill('Confirmed');
  await safety.getByLabel('Onset date').fill('2026-11-16');
  await safety.getByRole('button', { name: 'Record infection case' }).click();
  await expect(safety.getByRole('status')).toContainText('Infection surveillance case recorded');
  await safety.getByLabel('From').fill('2026-11-01');
  await safety.getByLabel('To').fill('2026-11-30');
  await safety.getByRole('button', { name: 'Load ward trends' }).click();
  await expect(safety.getByText('Medical Ward · HAI')).toBeVisible();
  expect(await page.evaluate(() => window.__safetyFixture.calls.map((call) => call.name))).toEqual(expect.arrayContaining(['report_safety_incident', 'investigate_safety_incident', 'add_safety_incident_action', 'update_safety_incident_action', 'close_safety_incident', 'record_infection_surveillance_case', 'get_ward_infection_trends']));
});

test('unrelated role sees no incident queue in the UI or incident rows through the API', async ({ page }) => {
  await signIn(page, process.env.CI_E2E_UNRELATED_EMAIL, process.env.CI_E2E_UNRELATED_PASSWORD);
  const apiRows = await page.evaluate(async () => {
    const client = window.OneMedSupabase.getClient();
    const { data, error } = await client.from('safety_incidents').select('id').eq('facility_id', 'a1000000-0000-4000-8000-000000000001');
    if (error) throw new Error(error.message);
    return data || [];
  });
  expect(apiRows).toEqual([]);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'incident_safety' })));
  await expect(page.getByRole('heading', { name: 'My assigned CAPA actions' })).toBeVisible();
  await expect(page.getByText('Restricted incident queue')).toHaveCount(0);
  await expect(page.getByText('My submitted incident reports')).toHaveCount(0);
  await expect(page.getByTestId('safety-incident-row')).toHaveCount(0);
});
