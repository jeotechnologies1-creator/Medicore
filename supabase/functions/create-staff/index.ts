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

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const requesterClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await requesterClient.auth.getUser();
  if (userError || !user) return Response.json({ error: 'Invalid session' }, { status: 401, headers: corsHeaders });

  const adminClient = createClient(url, serviceKey);
  const { data: requesterProfile } = await adminClient
    .from('profiles')
    .select('role, status')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (requesterProfile?.role !== 'super_admin' || requesterProfile?.status !== 'active') {
    return Response.json({ error: 'Only a super admin can create staff accounts.' }, { status: 403, headers: corsHeaders });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers: corsHeaders });
  }
  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
  const role = typeof payload.role === 'string' ? payload.role : '';
  const department = typeof payload.department === 'string' ? payload.department.trim() : '';
  const allowedRoles = ['doctor', 'nurse', 'receptionist', 'pharmacist', 'laboratory_scientist', 'radiographer', 'accountant', 'records_officer'];
  if (!email || !password || !fullName || !allowedRoles.includes(role) || password.length < 8) {
    return Response.json({ error: 'Provide a name, email, supported role, and a password of at least 8 characters.' }, { status: 400, headers: corsHeaders });
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) return Response.json({ error: createError?.message || 'Unable to create account.' }, { status: 400, headers: corsHeaders });

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .update({ role, department: department || null, full_name: fullName, status: 'active' })
    .eq('auth_user_id', created.user.id)
    .select('id, email, full_name, role, department, status')
    .single();
  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return Response.json({ error: profileError.message }, { status: 500, headers: corsHeaders });
  }
  return Response.json({ staff: profile }, { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
