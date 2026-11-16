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

test('surgery workspace exposes the safety checklist and anaesthesia workflow', async ({ page }) => {
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
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'surgeries' })));
  await expect(page.getByRole('heading', { name: 'Operating Theatre' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request Surgery' })).toBeVisible();
  const review = page.getByRole('button', { name: 'Review / Document' }).first();
  if (await review.count()) {
    await review.click();
    await expect(page.getByText('Surgical safety checklist', { exact: true })).toBeVisible();
    await expect(page.getByText('Anaesthesia and recovery', { exact: true })).toBeVisible();
    await expect(page.getByText('Consumable count reconciliation', { exact: true })).toBeVisible();
  }
});
