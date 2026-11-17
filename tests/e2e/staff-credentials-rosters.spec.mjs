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

async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(process.env.CI_E2E_CODING_EMAIL);
  await page.locator('#onemed-login-password').fill(process.env.CI_E2E_CODING_PASSWORD);
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

async function installStaffFixture(page) {
  await page.evaluate(async () => {
    const authClient = window.OneMedSupabase.getClient();
    const { data: { user: authUser } } = await authClient.auth.getUser();
    const { data: profile } = await authClient.from('profiles').select('id').eq('auth_user_id', authUser.id).single();
    const fixture = {
      facility: 'a1000000-0000-4000-8000-000000000001', actor: profile.id,
      staff: [{ id: profile.id, facility_id: 'a1000000-0000-4000-8000-000000000001', status: 'active', full_name: 'Test HR Admin', role: 'super_admin' }, { id: 'staff-clinician', facility_id: 'a1000000-0000-4000-8000-000000000001', status: 'active', full_name: 'Test Clinician', role: 'doctor' }],
      wards: [{ id: 'ward-1', name: 'Medical Ward' }], credentials: [], rules: [], alerts: [],
      leave: [{ id: 'leave-pending', profile_id: 'staff-clinician', leave_type: 'annual', starts_on: '2026-12-01', ends_on: '2026-12-03', reason: 'Planned leave', status: 'pending' }],
      rosters: [], calls: []
    };
    const sourceRows = (table) => ({ profiles: fixture.staff, wards: fixture.wards, staff_credentials: fixture.credentials, credential_signoff_rules: fixture.rules, staff_credential_alerts: fixture.alerts, staff_leave_requests: fixture.leave, duty_rosters: fixture.rosters }[table] || []);
    const client = {
      from: (table) => {
        const filters = [];
        const query = {
          select: () => query, eq: (key, value) => { filters.push([key, value]); return query; }, order: () => query, limit: () => query,
          then: (resolve, reject) => Promise.resolve({ data: sourceRows(table).filter((row) => filters.every(([key, value]) => row[key] === value)), error: null }).then(resolve, reject)
        };
        return query;
      },
      rpc: async (name, args) => {
        fixture.calls.push({ name, args });
        if (name === 'record_staff_credential') fixture.credentials.push({ id: 'credential-1', facility_id: fixture.facility, profile_id: args.p_profile_id, credential_body: args.p_body, credential_number: args.p_number, issued_on: args.p_issued_on, expires_on: args.p_expires_on, status: 'active' });
        if (name === 'configure_credential_signoff_rule') fixture.rules.push({ id: 'rule-1', facility_id: fixture.facility, clinical_role: args.p_role, credential_body: args.p_credential_body, blocks_signoff: args.p_blocks });
        if (name === 'notify_expiring_staff_credentials') return { data: 2, error: null };
        if (name === 'submit_staff_leave_request') fixture.leave.unshift({ id: 'leave-own', profile_id: fixture.actor, leave_type: args.p_leave_type, starts_on: args.p_starts_on, ends_on: args.p_ends_on, reason: args.p_reason, status: 'pending' });
        if (name === 'review_staff_leave_request') Object.assign(fixture.leave.find((row) => row.id === args.p_request_id), { status: args.p_decision });
        if (name === 'create_duty_roster') fixture.rosters.push({ id: 'roster-1', facility_id: fixture.facility, profile_id: args.p_profile_id, department: args.p_department, ward_id: args.p_ward_id, starts_at: args.p_starts_at, ends_at: args.p_ends_at, duty_role: args.p_duty_role });
        return { data: `${name}-id`, error: null };
      }
    };
    window.__staffFixture = fixture;
    window.OneMedSupabase = { getClient: () => client, getStatus: () => ({ configured: true, mode: 'supabase' }) };
  });
}

test('HR records credentials, alerts staff, configures sign-off blocks, reviews leave, and assigns rosters', async ({ page }) => {
  await signIn(page);
  await installStaffFixture(page);
  await page.getByRole('button', { name: 'HR & Staff' }).click();
  const panel = page.getByRole('region', { name: 'Staff credentials, leave, and rosters' });
  await expect(panel.getByText(/server trigger is authoritative/i)).toBeVisible();
  await expect(panel.getByText(/consultation signatures and admission discharge signatures/i)).toBeVisible();

  await panel.getByLabel('Staff member').first().selectOption('staff-clinician');
  await panel.getByLabel('Credential body').fill('Medical Council License');
  await panel.getByLabel('Credential number').fill('MCL-1001');
  await panel.getByLabel('Issued on').fill('2025-01-01');
  await panel.getByLabel('Expires on').fill('2027-01-01');
  await panel.getByRole('button', { name: 'Save credential' }).click();
  await expect(panel.getByRole('status')).toContainText('Credential record saved');

  await panel.getByLabel('Clinical role').fill('doctor');
  await panel.getByLabel('Required credential body').fill('Medical Council License');
  await panel.getByRole('button', { name: 'Save sign-off rule' }).click();
  await expect(panel.getByText(/doctor · Medical Council License: blocks missing or expired credential/)).toBeVisible();
  await panel.getByRole('button', { name: 'Send expiry alerts' }).click();
  await expect(panel.getByRole('status')).toContainText('sent to credential holders and HR recipients');

  await panel.getByLabel('Leave type').fill('annual');
  await panel.getByLabel('Reason').fill('Annual leave');
  await panel.getByLabel('Starts').fill('2026-12-10');
  await panel.getByLabel('Ends').fill('2026-12-12');
  await panel.getByRole('button', { name: 'Submit leave request' }).click();
  await expect(panel.getByRole('status')).toContainText('Leave request submitted');
  await panel.locator('article').filter({ hasText: 'Test Clinician' }).getByRole('button', { name: 'approved', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Leave request approved');

  await panel.getByLabel('Staff member').last().selectOption('staff-clinician');
  await panel.getByLabel('Department').fill('Medical');
  await panel.getByLabel('Ward (optional)').selectOption('ward-1');
  await panel.getByLabel('Shift starts').fill('2026-12-15T08:00');
  await panel.getByLabel('Shift ends').fill('2026-12-15T16:00');
  await panel.getByLabel('Duty role').fill('Day shift');
  await panel.getByRole('button', { name: 'Add roster entry' }).click();
  await expect(panel.getByRole('status')).toContainText('Duty roster entry created');
  const rpcNames = await page.evaluate(() => window.__staffFixture.calls.map((call) => call.name));
  expect(rpcNames).toEqual(expect.arrayContaining(['record_staff_credential', 'configure_credential_signoff_rule', 'notify_expiring_staff_credentials', 'submit_staff_leave_request', 'review_staff_leave_request', 'create_duty_roster']));
});

test('staff can submit and track their own leave request', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(process.env.CI_E2E_NURSE_EMAIL);
  await page.locator('#onemed-login-password').fill(process.env.CI_E2E_NURSE_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 30000 });
  await installStaffFixture(page);
  await page.getByRole('button', { name: 'My Leave' }).click();
  const leave = page.getByRole('region', { name: 'My staff leave requests' });
  await leave.getByLabel('Leave type').fill('sick');
  await leave.getByLabel('Reason').fill('Medical appointment');
  await leave.getByLabel('Starts').fill('2026-12-20');
  await leave.getByLabel('Ends').fill('2026-12-20');
  await leave.getByRole('button', { name: 'Submit leave request' }).click();
  await expect(leave.getByRole('status')).toContainText('submitted for HR review');
  expect(await page.evaluate(() => window.__staffFixture.calls.map((call) => call.name))).toContain('submit_staff_leave_request');
});
