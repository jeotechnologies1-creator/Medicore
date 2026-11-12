import {
  checkRateLimit,
  constantTimeEqual,
  corsHeadersFor,
  mapBounded,
  verifySignedTimestamp,
} from '../_shared/security.ts';

Deno.test('staff and portal CORS allows exact configured origins and denies others', () => {
  Deno.env.set('ALLOWED_ORIGINS', 'https://clinic.example, https://portal.example');
  const allowed = corsHeadersFor(new Request('https://edge.example', { headers: { origin: 'https://portal.example' } }));
  const denied = corsHeadersFor(new Request('https://edge.example', { headers: { origin: 'https://evil.example' } }));
  if (allowed?.['Access-Control-Allow-Origin'] !== 'https://portal.example' || denied !== null) throw new Error('CORS allow/deny mismatch');
});

Deno.test('rate limiter allows under limit, denies over limit, and fails closed on RPC error', async () => {
  let calls = 0;
  const client = { rpc: async (_name: string, args: Record<string, unknown>) => {
    calls++;
    if (args.p_user_key === null || typeof args.p_ip_key !== 'string') throw new Error('missing principal keys');
    return { data: calls === 1, error: null };
  } };
  const request = new Request('https://edge.example', { headers: { 'cf-connecting-ip': '192.0.2.10' } });
  if (!await checkRateLimit(client, request, 'create-staff', 'actor', 10)) throw new Error('expected allow');
  if (await checkRateLimit(client, request, 'create-patient-portal', 'actor', 10)) throw new Error('expected deny');
  let rejected = false;
  try { await checkRateLimit({ rpc: async () => ({ data: null, error: new Error('db down') }) }, request, 'integration-webhook', null, 10); } catch { rejected = true; }
  if (!rejected) throw new Error('rate limit service failure must reject');
});

Deno.test('webhook timestamp permits fresh signed timestamps and denies stale or malformed values', () => {
  const now = 1_800_000_000_000;
  if (verifySignedTimestamp(String(now / 1000), now) !== now / 1000) throw new Error('fresh timestamp rejected');
  if (verifySignedTimestamp(String(now / 1000 - 301), now) !== null) throw new Error('stale timestamp accepted');
  if (verifySignedTimestamp('bad', now) !== null) throw new Error('malformed timestamp accepted');
});

Deno.test('dispatcher bearer comparison accepts equal values and rejects mismatches', async () => {
  if (!await constantTimeEqual('Bearer secret', 'Bearer secret')) throw new Error('valid bearer rejected');
  if (await constantTimeEqual('Bearer secret', 'Bearer wrong')) throw new Error('invalid bearer accepted');
});

Deno.test('dispatcher worker pool keeps concurrency at or below five and processes all events', async () => {
  let active = 0;
  let peak = 0;
  const result = await mapBounded(Array.from({ length: 20 }, (_, index) => index), 5, async (value) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return value * 2;
  });
  if (peak > 5 || peak < 2 || result.length !== 20 || result[19] !== 38) throw new Error('bounded dispatch failed');
});
