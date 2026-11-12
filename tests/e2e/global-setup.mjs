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
  process.env.CI_E2E_EMAIL = email;
  process.env.CI_E2E_PASSWORD = password;
}
