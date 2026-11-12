import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, corsHeadersFor, recordAccountAudit } from '../_shared/security.ts';

Deno.serve(async (request) => {
  const corsHeaders = corsHeadersFor(request);
  if (!corsHeaders) return new Response('Origin not allowed', { status: 403 });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Missing authorization' }, { status: 401, headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return Response.json({ error: 'create-staff is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in the Edge Function environment.' }, { status: 500, headers: corsHeaders });
  const requesterClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await requesterClient.auth.getUser();
  if (userError || !user) return Response.json({ error: 'Invalid session' }, { status: 401, headers: corsHeaders });
  const adminClient = createClient(url, serviceKey);
  try {
    if (!await checkRateLimit(adminClient, request, 'create-staff', user.id, 10, 3600)) return Response.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429, headers: corsHeaders });
  } catch (error) {
    console.error('create-staff rate limit failed:', error);
    return Response.json({ error: 'Rate limiting is temporarily unavailable.' }, { status: 503, headers: corsHeaders });
  }
  const { data: mfaSetting, error: mfaSettingError } = await adminClient.from('system_settings').select('setting_value').eq('setting_key', 'mfa_enforcement').maybeSingle();
  const enforceMfa = mfaSettingError || mfaSetting?.setting_value?.enabled !== false;
  if (enforceMfa) {
    const { data: assurance, error: assuranceError } = await requesterClient.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance?.currentLevel !== 'aal2') {
      return Response.json({ error: 'Complete authenticator verification before creating staff accounts.' }, { status: 403, headers: corsHeaders });
    }
  }
  const { data: requesterProfile, error: requesterProfileError } = await adminClient
    .from('profiles')
    .select('role, status')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (requesterProfileError) return Response.json({ error: 'Unable to verify the administrator profile.' }, { status: 500, headers: corsHeaders });
  if (requesterProfile?.role !== 'super_admin' || requesterProfile?.status !== 'active') {
    return Response.json({ error: 'Only a super admin can create staff accounts.' }, { status: 403, headers: corsHeaders });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers: corsHeaders });
  }
  if ('password' in payload) return Response.json({ error: 'Admin-set passwords are not accepted. The account owner sets a password from the invitation email.' }, { status: 400, headers: corsHeaders });
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const fullNameValue = payload.fullName ?? payload.full_name ?? payload.name;
  const fullName = typeof fullNameValue === 'string' ? fullNameValue.trim() : '';
  const roleValue = typeof payload.role === 'string' ? payload.role.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  const roleAliases: Record<string, string> = {
    health_information_management_officer: 'records_officer',
    lab_scientist: 'laboratory_scientist',
  };
  const role = roleAliases[roleValue] ?? roleValue;
  const department = typeof payload.department === 'string' ? payload.department.trim() : '';
  const allowedRoles = ['doctor', 'nurse', 'receptionist', 'pharmacist', 'laboratory_scientist', 'radiographer', 'accountant', 'records_officer', 'surgeon', 'specialist', 'theatre_staff'];
  const invalidFields: string[] = [];
  if (!fullName) invalidFields.push('full name');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalidFields.push('valid email');
  if (!allowedRoles.includes(role)) invalidFields.push(`supported role (received “${role || 'empty'}”)`);
  if (invalidFields.length) return Response.json({ error: `Invalid staff details: ${invalidFields.join(', ')}.` }, { status: 400, headers: corsHeaders });

  const redirectTo = Deno.env.get('AUTH_INVITE_REDIRECT_URL');
  const inviteOptions = { data: { full_name: fullName }, ...(redirectTo ? { redirectTo } : {}) };
  const { data: created, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);
  if (createError || !created.user) {
    await recordAccountAudit(adminClient, user.id, null, email, role, 'failure', { stage: 'invite', error: createError?.message || 'invite_failed' });
    return Response.json({ error: createError?.message || 'Unable to create account.' }, { status: 400, headers: corsHeaders });
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .update({ role, department: department || null, full_name: fullName, status: 'active' })
    .eq('auth_user_id', created.user.id)
    .select('id, email, full_name, role, department, status')
    .single();
  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    await recordAccountAudit(adminClient, user.id, created.user.id, email, role, 'failure', { stage: 'profile', error: profileError.message });
    return Response.json({ error: profileError.message }, { status: 500, headers: corsHeaders });
  }
  await recordAccountAudit(adminClient, user.id, created.user.id, email, role, 'success');
  return Response.json({ staff: profile }, { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('create-staff Edge Function failed:', error);
    return Response.json({ error: 'Unexpected server error in create-staff. Check the Edge Function logs.' }, { status: 500, headers: corsHeaders });
  }
});
