import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

function totp(secret) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits=[...secret.replace(/\s/g,'').replace(/=+$/,'')].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join('');
  const bytes=[]; for(let i=0;i+8<=bits.length;i+=8) bytes.push(parseInt(bits.slice(i,i+8),2));
  const counter=Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest(); const offset=digest[digest.length-1]&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1_000_000).padStart(6,'0');
}

test('MAR barcode fields accept keyboard-wedge scanner input', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(process.env.CI_E2E_EMAIL);
  await page.locator('#onemed-login-password').fill(process.env.CI_E2E_PASSWORD);
  await page.getByRole('button',{name:'Sign In'}).click();
  const enrollment=page.getByRole('button',{name:/set up authenticator/i});
  if(await enrollment.isVisible().catch(()=>false)) {
    await enrollment.click();
    const text=await page.getByText(/Manual setup key:/).innerText();
    await page.getByLabel('Authenticator code').fill(totp(text.split(':').at(-1).trim()));
    await page.getByRole('button',{name:'Verify and continue'}).click();
  }
  await expect(page.getByRole('heading',{name:/dashboard/i})).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'Clinical Workflows',exact:true}).click();
  await page.getByRole('button',{name:'Medication Administration',exact:true}).click();
  const patientScan=page.getByLabel('Patient wristband scan (USB scanner)');
  await patientScan.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Medication / lot scan (USB scanner)')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(patientScan).toBeFocused();
  await page.keyboard.type('TEST-WRISTBAND-123'); await page.keyboard.press('Enter');
  await expect(patientScan).toHaveValue('TEST-WRISTBAND-123');
  const medicationScan=page.getByLabel('Medication / lot scan (USB scanner)');
  await medicationScan.focus(); await page.keyboard.type('TEST-LOT-BARCODE-456'); await page.keyboard.press('Enter');
  await expect(medicationScan).toHaveValue('TEST-LOT-BARCODE-456');
  await expect(page.getByText(/No camera access is used/)).toBeVisible();
});
