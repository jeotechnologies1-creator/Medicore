import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHmac } from 'node:crypto';

function base32ToBuffer(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of value.toUpperCase().replace(/=+$/g, '')) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 TOTP secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32ToBuffer(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

test('login enforces MFA enrollment before granting app access', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(process.env.CI_E2E_EMAIL);
  await page.locator('#onemed-login-password').fill(process.env.CI_E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByRole('button', { name: /set up authenticator/i })).toBeVisible();
  await page.getByRole('button', { name: /set up authenticator/i }).click();
  const setupText = await page.getByText(/Manual setup key:/).innerText();
  const secret = setupText.split(':').at(-1).trim().replace(/\s/g, '');
  await page.getByLabel('Authenticator code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify and continue' }).click();

  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('navigation')).toBeVisible();
  const dashboardA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(dashboardA11y.violations, JSON.stringify(dashboardA11y.violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length })), null, 2)).toEqual([]);

  await page.getByText('Patients', { exact: true }).first().click();
  const patientsA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(patientsA11y.violations, JSON.stringify(patientsA11y.violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length })), null, 2)).toEqual([]);
  await page.getByRole('button', { name: 'Register Patient' }).first().click();
  const patient = `CI Patient ${Date.now()}`;
  await page.getByLabel('Registering facility').selectOption('a1000000-0000-4000-8000-000000000001');
  await page.getByLabel('First Name').fill('CI');
  await page.getByLabel('Last Name').fill(`Patient${Date.now()}`);
  const patientName = await page.getByLabel('Last Name').inputValue();
  await page.getByLabel('Date of Birth').fill('1990-01-01');
  await page.getByLabel('Gender').selectOption('female');
  await page.getByLabel('Phone Number').fill(`080${String(Date.now()).slice(-8)}`);
  await page.getByRole('button', { name: 'Register Patient', exact: true }).last().click();
  await expect(page.getByText(patientName, { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByText('Appointments', { exact: true }).first().click();
  await page.getByRole('button', { name: 'New Appointment' }).click();
  await page.getByLabel('Patient').selectOption({ label: `CI ${patientName}` });
  await page.getByLabel('Department').selectOption('medical');
  await page.getByLabel('Date').fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  await page.getByLabel('Time').fill('10:30');
  await page.getByLabel('Appointment Type').selectOption('consultation');
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await expect(page.getByText(patientName, { exact: true })).toBeVisible();
});
