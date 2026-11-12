import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
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
  const { data: requester } = await adminClient.from('profiles').select('role, status').eq('auth_user_id', user.id).maybeSingle();
  if (requester?.role !== 'super_admin' || requester?.status !== 'active') return Response.json({ error: 'Only an active super admin can create patient portal accounts.' }, { status: 403, headers: corsHeaders });
  let payload: Record<string, unknown>;
  try { payload = await request.json(); } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers: corsHeaders }); }
  const patientId = typeof payload.patientId === 'string' ? payload.patientId : '';
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!patientId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) return Response.json({ error: 'Provide a patient, valid email, and password of at least 8 characters.' }, { status: 400, headers: corsHeaders });
  const { data: patient, error: patientError } = await adminClient.from('patients').select('id, first_name, last_name, email').eq('id', patientId).maybeSingle();
  if (patientError || !patient) return Response.json({ error: 'Patient record not found.' }, { status: 404, headers: corsHeaders });
  const { data: linkedProfile, error: linkedProfileError } = await adminClient.from('profiles').select('id').eq('patient_id', patientId).maybeSingle();
  if (linkedProfileError) return Response.json({ error: 'Unable to verify whether the patient already has a portal account.' }, { status: 500, headers: corsHeaders });
  if (linkedProfile) return Response.json({ error: 'This patient already has a linked portal account.' }, { status: 409, headers: corsHeaders });
  const fullName = `${patient.first_name} ${patient.last_name}`.trim();
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (createError || !created.user) return Response.json({ error: createError?.message || 'Unable to create account.' }, { status: 400, headers: corsHeaders });
  const { data: profile, error: profileError } = await adminClient.from('profiles').update({ role: 'patient', patient_id: patientId, full_name: fullName, status: 'active' }).eq('auth_user_id', created.user.id).select('id, email, full_name, role, patient_id, status').single();
  if (profileError) {
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(created.user.id);
    if (cleanupError) console.error('Failed to clean up unlinked portal auth user:', cleanupError);
    return Response.json({ error: cleanupError
      ? 'Portal profile setup failed and automatic account cleanup did not complete. Check Edge Function logs before retrying.'
      : 'The portal profile could not be linked to the patient; the temporary account was removed.' }, { status: 500, headers: corsHeaders });
  }
  if (patient.email !== email) {
    const { data: updatedPatient, error: patientUpdateError } = await adminClient.from('patients').update({ email }).eq('id', patientId).select('id').maybeSingle();
    if (patientUpdateError || !updatedPatient) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(created.user.id);
      if (cleanupError) console.error('Failed to clean up portal auth user after patient email update failed:', cleanupError);
      return Response.json({ error: cleanupError
        ? 'Patient email synchronization failed and automatic account cleanup did not complete. Check Edge Function logs before retrying.'
        : 'The patient email could not be synchronized; the temporary portal account was removed.' }, { status: 500, headers: corsHeaders });
    }
  }
  return Response.json({ patient: profile }, { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
