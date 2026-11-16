import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/\s/g, '').replace(/=+$/,'')].map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function signIn(page) {
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
}

test('laboratory QC and radiology structured report workflows are available', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'laboratory' })));
  await expect(page.getByRole('heading', { name: 'Laboratory' })).toBeVisible();
  await page.getByRole('button', { name: 'Quality Control' }).click();
  await expect(page.getByText('Laboratory quality control')).toBeVisible();
  await expect(page.getByLabel('Acceptance minimum')).toBeVisible();
  await expect(page.getByLabel('Acceptance maximum')).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'radiology' })));
  await expect(page.getByRole('heading', { name: 'Radiology' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Imaging Order' })).toBeVisible();
  const report = page.getByRole('button', { name: 'Report', exact: true }).first();
  if (await report.count()) {
    await report.click();
    await expect(page.getByLabel('Report state')).toBeVisible();
    await expect(page.getByLabel('Critical finding')).toBeVisible();
  }
});
