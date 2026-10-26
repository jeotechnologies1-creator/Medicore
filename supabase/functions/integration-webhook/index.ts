import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const encoder = new TextEncoder();
const toHex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const connectionId = request.headers.get('x-medicore-connection');
  const signature = request.headers.get('x-provider-signature')?.replace(/^sha256=/, '');
  if (!connectionId || !/^[0-9a-f-]{36}$/i.test(connectionId) || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return new Response('Invalid webhook headers', { status: 400 });
  const body = await request.text();
  if (encoder.encode(body).length > 1_000_000) return new Response('Payload too large', { status: 413 });
  const secretEnv = `MEDICORE_WEBHOOK_SECRET_${connectionId.replaceAll('-', '').toUpperCase()}`;
  const secret = Deno.env.get(secretEnv);
  if (!secret) return new Response('Webhook is not configured', { status: 404 });
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  const receivedBytes = encoder.encode(signature.toLowerCase());
  const expectedBytes = encoder.encode(expected);
  let mismatch = receivedBytes.length ^ expectedBytes.length;
  for (let i = 0; i < Math.max(receivedBytes.length, expectedBytes.length); i++) mismatch |= (receivedBytes[i] ?? 0) ^ (expectedBytes[i] ?? 0);
  if (mismatch !== 0) return new Response('Invalid signature', { status: 401 });
  let event: Record<string, unknown>;
  try { event = JSON.parse(body); } catch { return new Response('Invalid JSON', { status: 400 }); }
  const eventTypes = ['payment.succeeded', 'payment.failed', 'payer.claim.accepted', 'payer.claim.adjudicated', 'payer.remittance'];
  if (typeof event.event_id !== 'string' || event.event_id.length < 1 || event.event_id.length > 200 || typeof event.event_type !== 'string' || !eventTypes.includes(event.event_type) || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return new Response('Invalid event shape', { status: 400 });
  const { error } = await serviceClient.rpc('process_finance_integration_event', {
    p_connection_id: connectionId, p_event_id: event.event_id, p_event_type: event.event_type, payload: event.data,
  });
  if (error) return Response.json({ error: 'Event rejected' }, { status: 422 });
  return Response.json({ accepted: true });
});
