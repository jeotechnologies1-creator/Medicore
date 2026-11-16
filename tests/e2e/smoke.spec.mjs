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

async function preparePrintHarness(page, auditFails = false) {
  await page.addInitScript(() => {
    window.__printEvents = [];
    window.print = () => window.__printEvents.push('print');
  });
  await page.goto('/');
  await page.evaluate(() => {
    // Test-only access through the bundled module export; patient data is not
    // exposed on window/globalThis by the application.
    window.__storeSeedReady = fetch('/.vite/manifest.json').then(async (manifestResponse) => {
      const manifest = await manifestResponse.json();
      const entry = manifest['src/js/store.js'] || Object.values(manifest).find((candidate) => candidate.src === 'src/js/store.js');
      if (!entry?.file) throw new Error('The bundled app store module is absent from the Vite manifest.');
      const { getAppData } = await import(`/${entry.file}`);
      const patientId = '20000000-0000-4000-8000-000000000001';
      const facilityId = 'a1000000-0000-4000-8000-000000000001';
      getAppData().patients = [{
        id: patientId,
        home_facility_id: facilityId,
        firstName: 'Synthetic',
        lastName: 'Print Patient',
        patientNumber: 'PRINT-TEST-ONLY',
        medicalRecordNumber: 'MRN-TEST-ONLY',
        dateOfBirth: '1990-01-01'
      }];
    });
  });
  await page.evaluate(async () => window.__storeSeedReady);
  await page.evaluate((failAudit) => {
    window.OneMedSupabase = {
      getClient: () => ({
        rpc: async (name) => {
          window.__printEvents.push(name);
          return failAudit ? { data: null, error: new Error('Synthetic audit failure') } : { data: '30000000-0000-4000-8000-000000000001', error: null };
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { name: 'Synthetic Test Facility', code: 'PRINT-TEST', address: 'Test Address', state: 'Test State', phone: '0000000000', email: 'test@example.invalid' },
                error: null
              })
            })
          })
        })
      })
    };
  }, auditFails);
}

test('audited document printing renders text safely and audits before printing', async ({ page }) => {
  await preparePrintHarness(page);
  const events = await page.evaluate(async () => {
    await window.printEMRDocument({
      type: 'lab_report',
      id: '40000000-0000-4000-8000-000000000001',
      patientId: '20000000-0000-4000-8000-000000000001',
      title: 'Synthetic laboratory print test',
      author: 'CI Test Author',
      fields: [['Result note', '<img src=x onerror=alert(1)>']]
    });
    return window.__printEvents;
  });

  const printView = page.getByTestId('print-document-view');
  await expect(printView).toContainText('Synthetic Test Facility');
  await expect(printView).toContainText('Synthetic Print Patient');
  await expect(printView).toContainText('<img src=x onerror=alert(1)>');
  await expect(printView.locator('img, script')).toHaveCount(0);
  expect(events).toEqual(['record_document_print', 'print']);
});

test('document printing does not open the print dialog when auditing fails', async ({ page }) => {
  await preparePrintHarness(page, true);
  const result = await page.evaluate(async () => {
    try {
      await window.printEMRDocument({
        type: 'lab_report',
        id: '40000000-0000-4000-8000-000000000001',
        patientId: '20000000-0000-4000-8000-000000000001',
        title: 'Synthetic failed audit test',
        fields: []
      });
      return { rejected: false, events: window.__printEvents };
    } catch {
      return { rejected: true, events: window.__printEvents };
    }
  });

  expect(result.rejected).toBe(true);
  expect(result.events).toEqual(['record_document_print']);
  await expect(page.getByTestId('print-document-view')).toHaveCount(0);
});

test('login enforces MFA enrollment and service price changes require a second approver', async ({ page, browser }) => {
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
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const dashboardA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(dashboardA11y.violations, JSON.stringify(dashboardA11y.violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length })), null, 2)).toEqual([]);

  await page.getByText('Patients', { exact: true }).first().click();
  const patientsA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(patientsA11y.violations, JSON.stringify(patientsA11y.violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length })), null, 2)).toEqual([]);
  await page.getByRole('button', { name: 'Register Patient' }).first().click();
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

  const routes = [
    ['dashboard', 'Dashboard'], ['patients', 'Patients'], ['records', 'Health Information Management (HIM)'],
    ['appointments', 'Appointments'], ['doctors', 'Doctors'], ['laboratory', 'Laboratory'], ['radiology', 'Radiology'],
    ['clinical_workflows', 'Clinical Workflows'], ['clinical_decision_support', 'Clinical Support'], ['operations', 'Operations'],
    ['procurement', 'Procurement'], ['referrals', 'Referrals'], ['workforce', 'Workforce'], ['pharmacy', 'Pharmacy'],
    ['billing', 'Billing'], ['insurance', 'Insurance'], ['payments', 'Payments'], ['documents', 'Documents'],
    ['compliance', 'Compliance'], ['admissions', 'Admissions'], ['surgeries', 'Surgeries'], ['clinical_safety', 'Clinical Safety'],
    ['inventory', 'Inventory'], ['hr', 'HR & Staff'], ['offices', 'Medical Offices'], ['organization', 'Organization'],
    ['reports', 'Reports'], ['audit', 'Audit Logs'], ['settings', 'Settings']
  ];
  expect(await page.evaluate(() => 'appData' in globalThis)).toBe(false);
  for (const [route, label] of routes) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.header-page-title')).toHaveText(route.replaceAll('_', ' '));
    await expect(page.getByTestId('route-module-loading')).toHaveCount(0);
    await expect(page.getByText('This module could not be loaded. Reload the page and try again.')).toHaveCount(0);
    await expect(page.locator('#main-content')).not.toBeEmpty();
  }
  await page.getByRole('button', { name: 'Clinical Workflows', exact: true }).click();
  await page.getByLabel('Patient').selectOption({ label: `CI ${patientName}` });
  await page.getByLabel('Presenting complaint / circumstances').fill('TEST synthetic consultation encounter');
  await page.getByRole('button', { name: 'Register encounter' }).click();
  await expect(page.getByText('Encounter registered.')).toBeVisible();
  await page.getByRole('button', { name: 'Consultations', exact: true }).click();
  await page.getByLabel('Patient').selectOption({ label: `CI ${patientName}` });
  await page.getByLabel('Encounter').selectOption({ label: /TEST synthetic consultation encounter/ });
  await page.getByLabel('Chief Complaint').fill('TEST synthetic chief complaint');
  await page.getByLabel('Diagnosis').fill('TEST synthetic diagnosis');
  await page.getByLabel('Assessment').fill('TEST synthetic assessment');
  await page.getByLabel('Plan / Treatment').fill('TEST synthetic plan');
  await page.getByRole('button', { name: 'Save Draft' }).click();
  await expect(page.getByText(/Draft consultation saved/)).toBeVisible();
  const noteCard = page.locator('article').filter({ hasText: 'TEST synthetic chief complaint' }).first();
  await noteCard.getByRole('button', { name: 'Sign note' }).click();
  await expect(page.getByText(/Consultation signed and locked/)).toBeVisible();
  await noteCard.getByRole('button', { name: 'History' }).click();
  await page.getByLabel('Correction reason').fill('TEST synthetic correction reason');
  await page.getByLabel('Addendum').fill('TEST synthetic correction detail');
  await page.getByRole('button', { name: 'Addendum', exact: true }).click();
  await expect(page.getByText('TEST synthetic correction reason')).toBeVisible();
  await page.getByRole('button', { name: 'Billing', exact: true }).click();
  await page.getByRole('button', { name: 'Price Catalogue', exact: true }).click();
  await page.getByLabel('Facility').selectOption('a1000000-0000-4000-8000-000000000001');
  const chargeCode = `TEST-E2E-${Date.now()}`;
  await page.getByLabel('Code').fill(chargeCode);
  await page.getByLabel('Name').fill('TEST synthetic catalogue charge');
  await page.getByLabel('Department').fill('TEST department');
  await page.getByLabel('Price').fill('12.34');
  await page.getByRole('button', { name: 'Submit price for approval' }).click();
  await expect(page.getByText(/Price request submitted/)).toBeVisible();

  const approverContext = await browser.newContext();
  const approverPage = await approverContext.newPage();
  await approverPage.goto('/');
  await approverPage.getByLabel('Email').fill(process.env.CI_E2E_SECOND_EMAIL);
  await approverPage.locator('#onemed-login-password').fill(process.env.CI_E2E_SECOND_PASSWORD);
  await approverPage.getByRole('button', { name: 'Sign In' }).click();
  await expect(approverPage.getByRole('button', { name: /set up authenticator/i })).toBeVisible();
  await approverPage.getByRole('button', { name: /set up authenticator/i }).click();
  const approverSetupText = await approverPage.getByText(/Manual setup key:/).innerText();
  const approverSecret = approverSetupText.split(':').at(-1).trim().replace(/\s/g, '');
  await approverPage.getByLabel('Authenticator code').fill(totp(approverSecret));
  await approverPage.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(approverPage.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 30_000 });
  await approverPage.getByRole('button', { name: 'Billing', exact: true }).click();
  await approverPage.getByRole('button', { name: 'Price Catalogue', exact: true }).click();
  await approverPage.getByRole('button', { name: 'Approve pending price' }).click();
  await expect(approverPage.getByText(/Price approved and added to the effective price history/)).toBeVisible();
  await approverPage.getByLabel('Patient').selectOption({ label: `CI ${patientName}` });
  await approverPage.getByLabel('Active catalogue charge').selectOption({ label: `${chargeCode} · TEST synthetic catalogue charge` });
  const invoiceNumber = `TEST-E2E-INVOICE-${Date.now()}`;
  await approverPage.getByLabel('Invoice number').fill(invoiceNumber);
  await approverPage.getByRole('button', { name: 'Create catalogue invoice' }).click();
  await expect(approverPage.getByText(new RegExp(`Itemized invoice ${invoiceNumber} created`))).toBeVisible();
  await approverContext.close();
  expect(pageErrors).toEqual([]);
});
