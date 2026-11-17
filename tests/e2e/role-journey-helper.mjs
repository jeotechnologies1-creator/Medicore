import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';

const routeLabel = (moduleId) => moduleId.replaceAll('_', ' ');

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

export function roleJourney({ role, allowed, denied }) {
  test(`${role} can reach assigned screens and is denied other screens, including direct navigation`, async ({ page }) => {
    const prefix = `CI_E2E_${role.toUpperCase()}`;
    const email = process.env[`${prefix}_EMAIL`];
    const password = process.env[`${prefix}_PASSWORD`];
    test.skip(!email || !password, `Set ${prefix}_EMAIL and ${prefix}_PASSWORD to run this role journey.`);

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

    const title = page.locator('.header-page-title');
    for (const moduleId of allowed) {
      await page.evaluate((id) => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: id })), moduleId);
      await expect(title).toHaveText(routeLabel(moduleId));
    }

    for (const moduleId of denied) {
      const before = await title.innerText();
      await page.evaluate((id) => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: id })), moduleId);
      await expect(title).toHaveText(before);
      await expect(page.getByRole('button', { name: new RegExp(`^${routeLabel(moduleId)}$`, 'i') })).toHaveCount(0);
    }
  });
}
