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

const topLevelRoutes = [
  'dashboard', 'patients', 'records', 'vital_registry', 'appointments', 'doctors', 'consultations', 'laboratory', 'radiology',
  'clinical_workflows', 'clinical_decision_support', 'operations', 'procurement', 'referrals', 'workforce', 'pharmacy', 'inventory',
  'billing', 'insurance', 'payments', 'documents', 'compliance', 'admissions', 'surgeries', 'clinical_safety', 'incident_safety',
  'blood_bank', 'reports', 'audit', 'settings', 'offices', 'organization', 'hr', 'staff_leave', 'portal', 'ward', 'nursing', 'vitals',
  'upload', 'medications', 'results', 'messages', 'prescriptions', 'lab_results'
];

test('super admin can render every top-level application route', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/');
  await page.getByLabel('Email').fill(process.env.CI_E2E_EMAIL);
  await page.locator('#onemed-login-password').fill(process.env.CI_E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  const enrollment = page.getByRole('button', { name: /set up authenticator/i });
  if (await enrollment.isVisible().catch(() => false)) {
    await enrollment.click();
    const setup = await page.getByText(/Manual setup key:/).innerText();
    await page.getByLabel('Authenticator code').fill(totp(setup.split(':').at(-1).trim()));
    await page.getByRole('button', { name: 'Verify and continue' }).click();
  }
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 30000 });

  for (const route of topLevelRoutes) {
    await page.evaluate((moduleId) => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: moduleId })), route);
    await expect(page.locator('.header-page-title')).toHaveText(route.replaceAll('_', ' '));
    await expect(page.getByTestId('route-module-loading')).toHaveCount(0);
    await expect(page.getByText('This module could not be loaded. Reload the page and try again.')).toHaveCount(0);
    await expect(page.locator('#main-content')).not.toBeEmpty();
  }
});
