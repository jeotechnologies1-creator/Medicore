import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { constantTimeEqual, mapBounded } from '../_shared/security.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const client = createClient(url, serviceKey);

Deno.serve(async (request) => {
  const authorization = request.headers.get('authorization') ?? '';
  if (request.method !== 'POST' || !await constantTimeEqual(authorization, `Bearer ${serviceKey}`)) {
    return new Response('Unauthorized', { status: 401 });
  }
  let limit = 25;
  try {
    const body = await request.json();
    limit = Math.max(1, Math.min(100, Number(body.limit) || 25));
  } catch { /* use bounded default */ }
  const { data: messages, error } = await client.rpc('claim_outbound_messages', { p_limit: limit });
  if (error) return Response.json({ error: 'Unable to lease outbound messages' }, { status: 500 });

  // Connector contract is provider-neutral: POST one message envelope to the
  // configured HTTPS endpoint and return any 2xx status for successful delivery.
  const config = JSON.parse(Deno.env.get('MEDICORE_NOTIFICATION_CONNECTOR_JSON') ?? '{}');
  const results = await mapBounded((messages ?? []) as Record<string, unknown>[], 5, async (message) => {
    let ok = false;
    let errorText = 'Connector is not configured';
    try {
      if (typeof config.endpoint !== 'string' || typeof config.tokenEnv !== 'string') throw new Error(errorText);
      const endpoint = new URL(config.endpoint);
      if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== 'host.docker.internal') {
        throw new Error('Connector URL must use HTTPS');
      }
      const token = Deno.env.get(config.tokenEnv);
      if (!token) throw new Error('Connector credential is missing');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': String(message.id) },
        body: JSON.stringify({ channel: message.channel, recipient: message.recipient, template: message.template, payload: message.payload }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Connector returned HTTP ${response.status}`);
      ok = true;
      errorText = '';
    } catch (cause) {
      errorText = cause instanceof Error ? cause.message : 'Connector request failed';
    }
    const { error: saveError } = await client.rpc('complete_outbound_message', {
      p_id: message.id, p_lease: message.lease_token, p_ok: ok, p_error: ok ? null : errorText.slice(0, 500),
    });
    return { id: message.id, delivered: ok && !saveError };
  });
  return Response.json({ processed: results.length, results });
});
