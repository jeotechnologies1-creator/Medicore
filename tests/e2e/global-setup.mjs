import { createClient } from '@supabase/supabase-js';

export default async function globalSetup() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Local Supabase URL and service role key are required for browser smoke tests.');
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const email = 'ci-super-admin@example.test';
  const password = 'CI-only-Password-2026!';
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError && !/already been registered|already exists/i.test(createError.message)) throw createError;
  let userId = created.user?.id;
  if (!userId) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    userId = data.users.find((user) => user.email === email)?.id;
  }
  if (!userId) throw new Error('Could not locate the CI browser test identity.');

  const { error: facilityError } = await admin.from('facilities').upsert({
    id: 'a1000000-0000-4000-8000-000000000001', code: 'CI-E2E', name: 'CI E2E Facility'
  }, { onConflict: 'id' });
  if (facilityError) throw facilityError;
  const { error: profileError } = await admin.from('profiles').update({ role: 'super_admin', status: 'active' }).eq('auth_user_id', userId);
  if (profileError) throw profileError;
  const secondEmail = 'ci-second-super-admin@example.test';
  const secondPassword = 'CI-only-Second-Password-2026!';
  const { data: secondCreated, error: secondCreateError } = await admin.auth.admin.createUser({ email: secondEmail, password: secondPassword, email_confirm: true });
  if (secondCreateError && !/already been registered|already exists/i.test(secondCreateError.message)) throw secondCreateError;
  let secondUserId = secondCreated.user?.id;
  if (!secondUserId) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    secondUserId = data.users.find((user) => user.email === secondEmail)?.id;
  }
  if (!secondUserId) throw new Error('Could not locate the second CI browser test identity.');
  const { error: secondProfileError } = await admin.from('profiles').update({ role: 'super_admin', status: 'active' }).eq('auth_user_id', secondUserId);
  if (secondProfileError) throw secondProfileError;
  const nurseEmail = 'ci-nurse-coding-denied@example.test';
  const nursePassword = 'CI-only-Nurse-Password-2026!';
  const { data: nurseCreated, error: nurseCreateError } = await admin.auth.admin.createUser({ email: nurseEmail, password: nursePassword, email_confirm: true });
  if (nurseCreateError && !/already been registered|already exists/i.test(nurseCreateError.message)) throw nurseCreateError;
  let nurseUserId = nurseCreated.user?.id;
  if (!nurseUserId) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    nurseUserId = data.users.find((user) => user.email === nurseEmail)?.id;
  }
  if (!nurseUserId) throw new Error('Could not locate the non-records browser test identity.');
  const { error: nurseProfileError } = await admin.from('profiles').update({ role: 'nurse', status: 'active', facility_id: 'a1000000-0000-4000-8000-000000000001' }).eq('auth_user_id', nurseUserId);
  if (nurseProfileError) throw nurseProfileError;
  const unrelatedEmail = 'ci-accountant-safety-denied@example.test';
  const unrelatedPassword = 'CI-only-Accountant-Safety-2026!';
  const { data: unrelatedCreated, error: unrelatedCreateError } = await admin.auth.admin.createUser({ email: unrelatedEmail, password: unrelatedPassword, email_confirm: true });
  if (unrelatedCreateError && !/already been registered|already exists/i.test(unrelatedCreateError.message)) throw unrelatedCreateError;
  let unrelatedUserId = unrelatedCreated.user?.id;
  if (!unrelatedUserId) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    unrelatedUserId = data.users.find((user) => user.email === unrelatedEmail)?.id;
  }
  if (!unrelatedUserId) throw new Error('Could not locate the unrelated-role safety access test identity.');
  const { error: unrelatedProfileError } = await admin.from('profiles').update({ role: 'accountant', status: 'active', facility_id: 'a1000000-0000-4000-8000-000000000001' }).eq('auth_user_id', unrelatedUserId);
  if (unrelatedProfileError) throw unrelatedProfileError;
  const codingEmail = 'ci-coding-workspace@example.test';
  const codingPassword = 'CI-only-Coding-Password-2026!';
  const { data: codingCreated, error: codingCreateError } = await admin.auth.admin.createUser({ email: codingEmail, password: codingPassword, email_confirm: true });
  if (codingCreateError && !/already been registered|already exists/i.test(codingCreateError.message)) throw codingCreateError;
  let codingUserId = codingCreated.user?.id;
  if (!codingUserId) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    codingUserId = data.users.find((user) => user.email === codingEmail)?.id;
  }
  if (!codingUserId) throw new Error('Could not locate the coding workspace browser test identity.');
  const { error: codingProfileError } = await admin.from('profiles').update({ role: 'super_admin', status: 'active', facility_id: 'a1000000-0000-4000-8000-000000000001' }).eq('auth_user_id', codingUserId);
  if (codingProfileError) throw codingProfileError;
  const clinicianEmail = 'ci-clinician-coding-response@example.test';
  const clinicianPassword = 'CI-only-Clinician-Password-2026!';
  const { data: clinicianCreated, error: clinicianCreateError } = await admin.auth.admin.createUser({ email: clinicianEmail, password: clinicianPassword, email_confirm: true });
  if (clinicianCreateError && !/already been registered|already exists/i.test(clinicianCreateError.message)) throw clinicianCreateError;
  let clinicianUserId = clinicianCreated.user?.id;
  if (!clinicianUserId) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    clinicianUserId = data.users.find((user) => user.email === clinicianEmail)?.id;
  }
  if (!clinicianUserId) throw new Error('Could not locate the clinician query response test identity.');
  const { error: clinicianProfileError } = await admin.from('profiles').update({ role: 'doctor', status: 'active', facility_id: 'a1000000-0000-4000-8000-000000000001' }).eq('auth_user_id', clinicianUserId);
  if (clinicianProfileError) throw clinicianProfileError;
  const reviewerEmail = 'ci-release-reviewer@example.test';
  const reviewerPassword = 'CI-only-Release-Reviewer-2026!';
  const { data: reviewerCreated, error: reviewerCreateError } = await admin.auth.admin.createUser({ email: reviewerEmail, password: reviewerPassword, email_confirm: true });
  if (reviewerCreateError && !/already been registered|already exists/i.test(reviewerCreateError.message)) throw reviewerCreateError;
  let reviewerUserId = reviewerCreated.user?.id;
  if (!reviewerUserId) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    reviewerUserId = data.users.find((user) => user.email === reviewerEmail)?.id;
  }
  if (!reviewerUserId) throw new Error('Could not locate the disclosure second-review test identity.');
  const { error: reviewerProfileError } = await admin.from('profiles').update({ role: 'super_admin', status: 'active', facility_id: 'a1000000-0000-4000-8000-000000000001' }).eq('auth_user_id', reviewerUserId);
  if (reviewerProfileError) throw reviewerProfileError;
  process.env.CI_E2E_EMAIL = email;
  process.env.CI_E2E_PASSWORD = password;
  process.env.CI_E2E_SECOND_EMAIL = secondEmail;
  process.env.CI_E2E_SECOND_PASSWORD = secondPassword;
  process.env.CI_E2E_NURSE_EMAIL = nurseEmail;
  process.env.CI_E2E_NURSE_PASSWORD = nursePassword;
  process.env.CI_E2E_UNRELATED_EMAIL = unrelatedEmail;
  process.env.CI_E2E_UNRELATED_PASSWORD = unrelatedPassword;
  process.env.CI_E2E_CODING_EMAIL = codingEmail;
  process.env.CI_E2E_CODING_PASSWORD = codingPassword;
  process.env.CI_E2E_CLINICIAN_EMAIL = clinicianEmail;
  process.env.CI_E2E_CLINICIAN_PASSWORD = clinicianPassword;
  process.env.CI_E2E_RELEASE_REVIEWER_EMAIL = reviewerEmail;
  process.env.CI_E2E_RELEASE_REVIEWER_PASSWORD = reviewerPassword;
}
