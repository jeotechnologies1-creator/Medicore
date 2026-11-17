import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/\s/g, '').replace(/=+$/g, '')].map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest(); const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(process.env.CI_E2E_CODING_EMAIL);
  await page.locator('#onemed-login-password').fill(process.env.CI_E2E_CODING_PASSWORD);
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

test('an adjustment submitted against a period closed after loading is rejected visibly', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => {
    const rows = {
      accounting_periods: [{ id: 'period-open', facility_id: 'a1000000-0000-4000-8000-000000000001', period_name: 'November', starts_on: '2026-11-01', ends_on: '2026-11-30', status: 'open' }],
      general_ledger_accounts: [
        { id: 'account-debit', facility_id: 'a1000000-0000-4000-8000-000000000001', account_code: '5000', account_name: 'Expense', account_type: 'expense', status: 'active' },
        { id: 'account-credit', facility_id: 'a1000000-0000-4000-8000-000000000001', account_code: '2000', account_name: 'Payable', account_type: 'liability', status: 'active' }
      ],
      accounts_receivable_ageing: [], accounts_payable_ageing: [], trial_balance_report: [], journal_entries: [], integration_connections: []
    };
    const calls = [];
    const client = {
      from(table) {
        const query = { select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
          then(resolve, reject) { return Promise.resolve({ data: rows[table] || [], error: null }).then(resolve, reject); } };
        return query;
      },
      async rpc(name, args) {
        calls.push({ name, args });
        if (name === 'post_ledger_adjustment') return { data: null, error: { message: 'Selected accounting period is closed. Post corrections in the next open period.' } };
        return { data: null, error: null };
      }
    };
    window.__billingFixture = { calls };
    window.OneMedSupabase = { getClient: () => client, getStatus: () => ({ configured: true, mode: 'supabase' }) };
  });
  await page.getByRole('button', { name: 'Billing', exact: true }).click();
  await page.getByRole('button', { name: 'General Ledger', exact: true }).click();
  await page.getByLabel('Accounting period').selectOption('period-open');
  await page.getByLabel('Adjustment memo').fill('Late correction after close');
  await page.getByLabel('Debit account').selectOption('account-debit');
  await page.getByLabel('Debit amount (NGN)').fill('100');
  await page.getByLabel('Credit account').selectOption('account-credit');
  await page.getByLabel('Credit amount (NGN)').fill('100');
  await page.getByRole('button', { name: 'Post adjustment' }).click();
  await expect(page.getByRole('status')).toContainText('Posting rejected by accounting-period controls');
  await expect(page.getByRole('status')).toContainText('Selected accounting period is closed');
  expect(await page.evaluate(() => window.__billingFixture.calls.map((call) => call.name))).toContain('post_ledger_adjustment');
});
