import {
  checkRateLimit,
  constantTimeEqual,
  corsHeadersFor,
  createTtlCache,
  mapBounded,
  monitoringCounterGroups,
  parseConnectorConfig,
  safeEdgeErrorMetadata,
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

Deno.test('IP-only limits omit user keys while authenticated limits combine user and IP keys', async () => {
  const seen: Record<string, unknown>[] = [];
  const client = { rpc: async (_name: string, args: Record<string, unknown>) => { seen.push(args); return { data: true, error: null }; } };
  const request = new Request('https://edge.example', { headers: { 'cf-connecting-ip': '192.0.2.44' } });
  await checkRateLimit(client, request, 'integration-webhook', null, 120);
  await checkRateLimit(client, request, 'create-staff', 'actor-1', 10);
  await checkRateLimit(client, request, 'monitoring-health', null, 60);
  await checkRateLimit(client, request, 'monitoring-post', null, 60);
  await checkRateLimit(client, request, 'notification-dispatch', 'service-scheduler', 120);
  if (seen[0].p_user_key !== null || typeof seen[0].p_ip_key !== 'string') throw new Error('webhook pre-auth bucket must be IP-only');
  if (typeof seen[1].p_user_key !== 'string' || typeof seen[1].p_ip_key !== 'string') throw new Error('authenticated limits must include user and IP buckets');
  if (seen[1].p_scope !== 'create-staff') throw new Error('rate limit scope was not preserved');
  if (seen.slice(2, 4).some((args) => args.p_user_key !== null) || seen[4].p_user_key === null) throw new Error('monitoring and notification key strategy is incorrect');
});

Deno.test('client-reported event counters remain separate from server counters', () => {
  const counters = monitoringCounterGroups({ authenticationAnomalies: 2, edgeFunctionErrors: 3 }, { errors: 5, authAnomalies: 7 });
  if (counters.authentication_anomalies !== 2 || counters.edge_function_errors !== 3) throw new Error('server counters included client reports');
  if (counters.client_reported_client_errors !== 5 || counters.client_reported_auth_anomalies !== 7) throw new Error('client counters were not kept separate');
});

Deno.test('monitoring health TTL cache reuses results for 15 seconds and then refreshes', async () => {
  const cache = createTtlCache<number>();
  let loads = 0;
  const load = async () => ++loads;
  if (await cache.getOrLoad(load, 15_000, 1_000) !== 1) throw new Error('initial cache load failed');
  if (await cache.getOrLoad(load, 15_000, 15_999) !== 1 || loads !== 1) throw new Error('cache did not reuse fresh health value');
  if (await cache.getOrLoad(load, 15_000, 16_000) !== 2 || loads !== 2) throw new Error('cache did not refresh after expiry');
});

Deno.test('concurrent monitoring health cache misses share one database load', async () => {
  const cache = createTtlCache<number>();
  let loads = 0;
  const load = async () => { loads++; await new Promise((resolve) => setTimeout(resolve, 1)); return loads; };
  const values = await Promise.all([cache.getOrLoad(load, 15_000), cache.getOrLoad(load, 15_000)]);
  if (loads !== 1 || values[0] !== values[1]) throw new Error('concurrent health checks were not coalesced');
});

Deno.test('connector configuration parser accepts objects and rejects malformed or non-object JSON', () => {
  const config = parseConnectorConfig('{"payer":{"baseUrl":"https://payer.example"}}');
  if ((config.payer as Record<string, unknown>).baseUrl !== 'https://payer.example') throw new Error('valid connector config rejected');
  for (const raw of ['{', '[]', 'null', '"not an object"']) {
    let rejected = false;
    try { parseConnectorConfig(raw); } catch { rejected = true; }
    if (!rejected) throw new Error('invalid connector config accepted');
  }
});

Deno.test('safe edge error metadata uses allowlisted error names and configured environment', () => {
  const known = safeEdgeErrorMetadata(new TypeError('sensitive detail'), 'staging');
  const unknown = safeEdgeErrorMetadata(Object.assign(new Error('secret'), { name: 'PatientRecordError' }), 'untrusted');
  const fallback = safeEdgeErrorMetadata(undefined, undefined);
  if (known.error_class !== 'TypeError' || known.environment !== 'staging') throw new Error('known safe metadata was not retained');
  if (unknown.error_class !== 'UnknownError' || unknown.environment !== 'production') throw new Error('unknown values were not restricted');
  if (fallback.error_class !== 'UnknownError' || fallback.environment !== 'production') throw new Error('default metadata is incorrect');
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
