import { createClient } from '../_shared/supabase.ts';
import { checkRateLimit, corsHeadersFor, reportSafeEdgeError } from '../_shared/security.ts';

Deno.serve(async (request) => {
  const corsHeaders = corsHeadersFor(request);
  if (!corsHeaders) return new Response('Origin not allowed', { status: 403 });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return Response.json({ error: 'Missing authorization' }, { status: 401, headers: corsHeaders });
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) return Response.json({ error: 'Password reset is not configured.' }, { status: 500, headers: corsHeaders });

    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) return Response.json({ error: 'Invalid session' }, { status: 401, headers: corsHeaders });
    const requesterClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: claimData, error: claimsError } = await requesterClient.auth.getClaims(accessToken);
    const claims = claimData?.claims;
    const actorId = typeof claims?.sub === 'string' ? claims.sub : '';
    const expectedIssuer = `${url.replace(/\/$/, '')}/auth/v1`;
    if (claimsError || !claims || !actorId || claims.iss !== expectedIssuer || claims.role !== 'authenticated') {
      return Response.json({ error: 'Invalid session' }, { status: 401, headers: corsHeaders });
    }

    const adminClient = createClient(url, serviceKey);
    const { data: actor, error: actorError } = await adminClient.from('profiles')
      .select('role,status').eq('auth_user_id', actorId).maybeSingle();
    if (actorError) return Response.json({ error: 'Unable to verify the administrator profile.' }, { status: 500, headers: corsHeaders });
    if (actor?.role !== 'super_admin' || actor?.status !== 'active') {
      return Response.json({ error: 'Only an active Super Admin can request password resets.' }, { status: 403, headers: corsHeaders });
    }

    try {
      if (!await checkRateLimit(adminClient, request, 'admin-password-reset', actorId, 5, 3600)) {
        return Response.json({ error: 'Password reset request limit reached. Try again later.' }, { status: 429, headers: corsHeaders });
      }
    } catch (error) {
      await reportSafeEdgeError('password-reset', error);
      return Response.json({ error: 'Password reset is temporarily unavailable.' }, { status: 503, headers: corsHeaders });
    }

    let payload: Record<string, unknown>;
    try { payload = await request.json(); } catch {
      return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers: corsHeaders });
    }
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Enter a valid account email address.' }, { status: 400, headers: corsHeaders });
    }

    // Use a service client for profile resolution, but an anonymous Auth client
    // for the recovery email. That keeps the service-role credential away from
    // the recovery endpoint and avoids revealing whether an email is registered.
    const { data: target, error: targetError } = await adminClient.from('profiles')
      .select('id,auth_user_id,email,role').eq('email', email).not('auth_user_id', 'is', null).maybeSingle();
    if (targetError) {
      await reportSafeEdgeError('password-reset', targetError);
      return Response.json({ error: 'Unable to process this password reset request.' }, { status: 500, headers: corsHeaders });
    }

    if (target?.auth_user_id) {
      const redirectTo = Deno.env.get('AUTH_PASSWORD_RESET_REDIRECT_URL')
        || Deno.env.get('AUTH_INVITE_REDIRECT_URL')
        || request.headers.get('origin');
      if (!redirectTo) return Response.json({ error: 'Password reset redirect is not configured.' }, { status: 500, headers: corsHeaders });
      const recoveryClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { error: recoveryError } = await recoveryClient.auth.resetPasswordForEmail(email, { redirectTo });
      const { error: auditError } = await adminClient.from('account_admin_audit').insert({
        actor_auth_user_id: actorId,
        target_auth_user_id: target.auth_user_id,
        target_email: email,
        action: 'account_recovered',
        assigned_role: target.role,
        outcome: recoveryError ? 'failure' : 'success',
        details: { source: 'super_admin_settings', method: 'password_reset_email', error: recoveryError?.code || null }
      });
      if (auditError) await reportSafeEdgeError('password-reset-audit', auditError);
      if (recoveryError) {
        const rateLimited = /rate limit|too many requests/i.test(recoveryError.message || '');
        return Response.json({ error: rateLimited ? 'Supabase email rate limit reached. Wait before requesting another reset email.' : 'The password reset email could not be sent. Check the Auth email configuration and try again.' }, { status: rateLimited ? 429 : 502, headers: corsHeaders });
      }
    } else {
      const { error: auditError } = await adminClient.from('account_admin_audit').insert({
        actor_auth_user_id: actorId,
        target_email: email,
        action: 'account_recovered',
        outcome: 'failure',
        details: { source: 'super_admin_settings', method: 'password_reset_email', reason: 'no_linked_profile' }
      });
      if (auditError) await reportSafeEdgeError('password-reset-audit', auditError);
    }

    return Response.json({ message: 'If this email belongs to a OneMed account, a password reset link has been sent to it.' }, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    await reportSafeEdgeError('password-reset', error);
    return Response.json({ error: 'Unexpected server error. Check the request-password-reset Edge Function logs.' }, { status: 500, headers: corsHeaders });
  }
});
