import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const serviceClient = createClient(supabaseUrl, serviceKey);
const routes: Record<string, string> = {
  'payer.claim.submit': 'claims',
  'payment.intent.create': 'payment-intents',
  'ledger.journal.posted': 'journal-entries',
};

Deno.serve(async (request) => {
  if (request.method !== 'POST' || request.headers.get('authorization') !== `Bearer ${serviceKey}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  let limit = 25;
  try {
    const body = await request.json().catch(() => ({}));
    limit = Math.max(1, Math.min(100, Number(body.limit) || 25));
  } catch { /* use bounded default */ }

  const { data: events, error } = await serviceClient.rpc('claim_integration_outbox', { p_limit: limit });
  if (error) return Response.json({ error: 'Unable to lease integration events' }, { status: 500 });
  const connectorConfig = JSON.parse(Deno.env.get('MEDICORE_CONNECTORS_JSON') ?? '{}');
  const results = await Promise.all((events ?? []).map(async (event: Record<string, unknown>) => {
    const connector = connectorConfig[event.provider_code as string];
    const route = routes[event.event_type as string];
    try {
      if (!connector || !route || typeof connector.baseUrl !== 'string' || typeof connector.tokenEnv !== 'string') {
        throw new Error('Connector is not configured for this event');
      }
      const base = new URL(connector.baseUrl.endsWith('/') ? connector.baseUrl : `${connector.baseUrl}/`);
      if (base.protocol !== 'https:' && base.hostname !== 'host.docker.internal' && base.hostname !== 'localhost') {
        throw new Error('Connector URL must use HTTPS');
      }
      const token = Deno.env.get(connector.tokenEnv);
      if (!token) throw new Error('Connector credential is missing');
      if (event.event_type === 'payment.intent.create' && typeof connector.returnUrl === 'string' && new URL(connector.returnUrl).protocol !== 'https:') {
        throw new Error('Payment return URL must use HTTPS');
      }
      const outboundPayload = event.event_type === 'payment.intent.create' && typeof connector.returnUrl === 'string'
        ? { ...(event.payload as Record<string, unknown>), return_url: connector.returnUrl }
        : event.payload;
      const response = await fetch(new URL(route, base), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': String(event.idempotency_key) },
        body: JSON.stringify(outboundPayload),
        signal: AbortSignal.timeout(15000),
      });
      const responseBody = await response.text();
      if (!response.ok) throw new Error(`Connector returned HTTP ${response.status}`);
      let normalized: Record<string, unknown> = {};
      try { normalized = JSON.parse(responseBody); } catch { /* provider may return an empty body */ }
      if (event.event_type === 'payment.intent.create' && (typeof normalized.checkout_url !== 'string' || !normalized.checkout_url.startsWith('https://'))) {
        throw new Error('Gateway did not return a secure checkout URL');
      }
      const safeResponse = Object.fromEntries(['id', 'reference', 'status', 'checkout_url'].filter((key) => typeof normalized[key] === 'string').map((key) => [key, normalized[key]]));
      const { error: saveError } = await serviceClient.rpc('complete_integration_outbox', {
        p_id: event.id, p_attempt: event.attempts, p_ok: true, p_response: safeResponse,
        p_external_reference: String(safeResponse.id ?? safeResponse.reference ?? ''), p_error: null,
      });
      if (saveError) throw new Error('Unable to persist connector result');
      return { id: event.id, delivered: true };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Connector request failed';
      await serviceClient.rpc('complete_integration_outbox', {
        p_id: event.id, p_attempt: event.attempts, p_ok: false, p_response: {}, p_external_reference: null, p_error: message.slice(0, 500),
      });
      return { id: event.id, delivered: false };
    }
  }));
  return Response.json({ processed: results.length, results });
});
