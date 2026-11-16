import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits=[...secret.replace(/\s/g,'').replace(/=+$/,'')].map((char)=>alphabet.indexOf(char).toString(2).padStart(5,'0')).join('');
  const bytes=[]; for(let i=0;i+8<=bits.length;i+=8) bytes.push(parseInt(bits.slice(i,i+8),2));
  const counter=Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest(); const offset=digest[digest.length-1]&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}

test('ward module exposes the discharge checklist and structured summary fields', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(process.env.CI_E2E_EMAIL);
  await page.locator('#onemed-login-password').fill(process.env.CI_E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  const enroll=page.getByRole('button',{name:/set up authenticator/i});
  if(await enroll.isVisible().catch(()=>false)) { await enroll.click(); const setup=await page.getByText(/Manual setup key:/).innerText(); await page.getByLabel('Authenticator code').fill(totp(setup.split(':').at(-1).trim())); await page.getByRole('button',{name:'Verify and continue'}).click(); }
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'admissions' })));
  await expect(page.getByRole('heading', { name: 'Ward Management' })).toBeVisible();
  const discharge = page.getByRole('button', { name: 'Discharge / Transfer' }).first();
  test.skip(!(await discharge.count()), 'E2E account has no active admission to discharge.');
  await discharge.click();
  await expect(page.getByText('Required discharge checklist')).toBeVisible();
  await expect(page.getByLabel('Medication reconciliation completed')).toBeVisible();
  await expect(page.getByLabel('Follow-up booked')).toBeVisible();
  await expect(page.getByLabel('Patient instructions given')).toBeVisible();
  await expect(page.getByLabel('Condition at discharge')).toBeVisible();
  await expect(page.getByLabel('Checklist override reason (authorized clinician)')).toBeVisible();
});
