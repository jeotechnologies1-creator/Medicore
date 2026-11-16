import { test, expect } from '@playwright/test';

test('nursing care workspace exposes assessment, fluid, intervention and handover workflows', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(process.env.CI_E2E_EMAIL);
  await page.locator('#onemed-login-password').fill(process.env.CI_E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  const enroll = page.getByRole('button', { name: /set up authenticator/i });
  if (await enroll.isVisible().catch(() => false)) {
    await enroll.click();
    const setup = await page.getByText(/Manual setup key:/).innerText();
    const secret = setup.split(':').at(-1).trim().replace(/\s/g, '');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = [...secret].map(char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('');
    const bytes = [];
    for (let i=0;i+8<=bits.length;i+=8) bytes.push(parseInt(bits.slice(i,i+8),2));
    const { createHmac } = await import('node:crypto');
    const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
    const digest = createHmac('sha1',Buffer.from(bytes)).update(counter).digest();
    const offset=digest[digest.length-1]&15;
    const code=String(((digest.readUInt32BE(offset)&0x7fffffff)%1000000)).padStart(6,'0');
    await page.getByLabel('Authenticator code').fill(code);
    await page.getByRole('button',{name:'Verify and continue'}).click();
  }
  await expect(page.getByRole('heading',{name:/dashboard/i})).toBeVisible({timeout:30000});
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate',{detail:'nursing'})));
  await expect(page.getByText('Admission assessment',{exact:true})).toBeVisible();
  await expect(page.getByText('Care intervention',{exact:true})).toBeVisible();
  await expect(page.getByText('Fluid chart',{exact:true})).toBeVisible();
  await expect(page.getByText('Shift handover',{exact:true})).toBeVisible();
  await expect(page.getByText(/configurable placeholder/i)).toBeVisible();
});
