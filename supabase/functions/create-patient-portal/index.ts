import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, corsHeadersFor, recordAccountAudit, reportSafeEdgeError } from '../_shared/security.ts';

Deno.serve(async (request) => {
  const corsHeaders = corsHeadersFor(request);
  if (!corsHeaders) return new Response('Origin not allowed', { status: 403 });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Missing authorization' }, { status: 401, headers: corsHeaders });
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return Response.json({ error: 'create-patient-portal is not configured.' }, { status: 500, headers: corsHeaders });
  const requesterClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await requesterClient.auth.getUser();
  if (userError || !user) return Response.json({ error: 'Invalid session' }, { status: 401, headers: corsHeaders });
  const adminClient = createClient(url, serviceKey);
  try {
    if (!await checkRateLimit(adminClient, request, 'create-patient-portal', user.id, 10, 3600)) return Response.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: corsHeaders });
  } catch (error) {
    await reportSafeEdgeError('portal');
    return Response.json({ error: 'Rate limiting is temporarily unavailable.' }, { status: 503, headers: corsHeaders });
  }
  const { data: mfaSetting, error: mfaSettingError } = await adminClient.from('system_settings').select('setting_value').eq('setting_key', 'mfa_enforcement').maybeSingle();
  const enforceMfa = mfaSettingError || mfaSetting?.setting_value?.enabled !== false;
  if (enforceMfa) {
    const { data: assurance, error: assuranceError } = await requesterClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance?.currentLevel !== 'aal2') return Response.json({ error: 'Complete authenticator verification before creating portal accounts.' }, { status: 403, headers: corsHeaders });
  }
  const { data: requester } = await adminClient.from('profiles').select('role, status').eq('auth_user_id', user.id).maybeSingle();
  if (requester?.role !== 'super_admin' || requester?.status !== 'active') return Response.json({ error: 'Only an active super admin can create patient portal accounts.' }, { status: 403, headers: corsHeaders });
  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers: corsHeaders }); }
  if ('password' in payload) return Response.json({ error: 'Admin-set passwords are not accepted. The account owner sets a password from the invitation email.' }, { status: 400, headers: corsHeaders });
  const patientId = typeof payload.patientId === 'string' ? payload.patientId : '';
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!patientId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'Provide a patient and valid email address.' }, { status: 400, headers: corsHeaders });
  const { data: patient, error: patientError } = await adminClient.from('patients').select('id, first_name, last_name, email').eq('id', patientId).maybeSingle();
  if (patientError || !patient) return Response.json({ error: 'Patient record not found.' }, { status: 404, headers: corsHeaders });
  const { data: linkedProfile, error: linkedProfileError } = await adminClient.from('profiles').select('id').eq('patient_id', patientId).maybeSingle();
  if (linkedProfileError) return Response.json({ error: 'Unable to verify whether the patient already has a portal account.' }, { status: 500, headers: corsHeaders });
  if (linkedProfile) return Response.json({ error: 'This patient already has a linked portal account.' }, { status: 409, headers: corsHeaders });
  const fullName = `${patient.first_name} ${patient.last_name}`.trim();
  const redirectTo = Deno.env.get('AUTH_INVITE_REDIRECT_URL');
  const inviteOptions = { data: { full_name: fullName }, ...(redirectTo ? { redirectTo } : {}) };
  const { data: created, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);
  if (createError || !created.user) {
    await recordAccountAudit(adminClient, user.id, null, email, 'patient', 'failure', { stage: 'invite', error: createError?.message || 'invite_failed' });
    return Response.json({ error: createError?.message || 'Unable to create account.' }, { status: 400, headers: corsHeaders });
  }
  const { data: profile, error: profileError } = await adminClient.from('profiles').update({ role: 'patient', patient_id: patientId, full_name: fullName, status: 'active' }).eq('auth_user_id', created.user.id).select('id, email, full_name, role, patient_id, status').single();
  if (profileError) {
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(created.user.id);
    if (cleanupError) await reportSafeEdgeError('portal');
    await recordAccountAudit(adminClient, user.id, created.user.id, email, 'patient', 'failure', { stage: 'profile', error: profileError.message });
    return Response.json({ error: cleanupError
      ? 'Portal profile setup failed and automatic account cleanup did not complete. Check Edge Function logs before retrying.'
      : 'The portal profile could not be linked to the patient; the temporary account was removed.' }, { status: 500, headers: corsHeaders });
  }
  if (patient.email !== email) {
    const { data: updatedPatient, error: patientUpdateError } = await adminClient.from('patients').update({ email }).eq('id', patientId).select('id').maybeSingle();
    if (patientUpdateError || !updatedPatient) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(created.user.id);
      if (cleanupError) await reportSafeEdgeError('portal');
      await recordAccountAudit(adminClient, user.id, created.user.id, email, 'patient', 'failure', { stage: 'patient_email_sync' });
      return Response.json({ error: cleanupError
        ? 'Patient email synchronization failed and automatic account cleanup did not complete. Check Edge Function logs before retrying.'
        : 'The patient email could not be synchronized; the temporary portal account was removed.' }, { status: 500, headers: corsHeaders });
    }
  }
  await recordAccountAudit(adminClient, user.id, created.user.id, email, 'patient', 'success');
  return Response.json({ patient: profile }, { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
