import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, corsHeadersFor, constantTimeEqual, reportSafeEdgeError } from '../_shared/security.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const client = createClient(url, serviceKey);
const modules = new Set(['app','auth','dashboard','patients','records','appointments','clinical','laboratory','radiology','pharmacy','billing','admissions','portal','settings','other']);
const errorClasses = new Set(['Error','TypeError','RangeError','ReferenceError','NetworkError','UnknownError']);
const environments = new Set(['development','staging','production','other']);

Deno.serve(async (request) => {
  const cors = corsHeadersFor(request, 'GET, POST, OPTIONS');
  if (!cors) return new Response('Origin not allowed', { status: 403 });
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method === 'GET') {
    if (new URL(request.url).searchParams.get('alerts') === '1') {
      if (!await constantTimeEqual(request.headers.get('authorization') || '', `Bearer ${serviceKey}`)) return new Response('Unauthorized', { status: 401, headers: cors });
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [jobs, acknowledgements, messages, authEvents, authAnomalies, edgeErrors] = await Promise.all([
        client.from('fhir_exchange_jobs').select('id', { count: 'exact', head: true }).eq('status','failed'),
        client.from('result_acknowledgements').select('id', { count: 'exact', head: true }).in('status',['unacknowledged','escalated']).or(`due_at.is.null,due_at.lte.${new Date().toISOString()}`),
        client.from('outbound_messages').select('id', { count: 'exact', head: true }).eq('status','failed'),
        client.from('account_admin_audit').select('id', { count: 'exact', head: true }).eq('outcome','failure').gte('created_at',since),
        client.from('monitoring_events').select('id', { count: 'exact', head: true }).eq('event_type','auth_anomaly').gte('created_at',since),
        client.from('monitoring_events').select('id', { count: 'exact', head: true }).eq('event_type','edge_error').gte('created_at',since),
      ]);
      const failed = [jobs,acknowledgements,messages,authEvents,authAnomalies,edgeErrors].some((item) => item.error);
      if (failed) await reportSafeEdgeError('monitoring');
      return Response.json({ status: failed ? 'query_error' : 'ok', alerts: { failed_jobs: jobs.count || 0, unacknowledged_critical_results: acknowledgements.count || 0, failed_outbound_messages: messages.count || 0, authentication_anomalies: (authEvents.count || 0) + (authAnomalies.count || 0), edge_function_errors: edgeErrors.count || 0 } }, { status: failed ? 503 : 200, headers: cors });
    }
    const { error } = await client.from('system_settings').select('setting_key').eq('setting_key','downtime_read_only_mode').maybeSingle();
    if (error) await reportSafeEdgeError('monitoring');
    return Response.json({ status: error ? 'unhealthy' : 'ok', checked_at: new Date().toISOString() }, { status: error ? 503 : 200, headers: cors });
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2048) return new Response('Payload too large', { status: 413, headers: cors });
    body = JSON.parse(raw);
  } catch { return new Response('Invalid request', { status: 400, headers: cors }); }
  const isEdgeError = body.event_type === 'edge_error';
  if (isEdgeError && !await constantTimeEqual(request.headers.get('authorization') || '', `Bearer ${serviceKey}`)) return new Response('Unauthorized', { status: 401, headers: cors });
  if (!isEdgeError) {
    try {
      if (!await checkRateLimit(client, request, 'monitoring-client-error', null, 60, 60)) return new Response('Rate limited', { status: 429, headers: cors });
    } catch { return new Response('Monitoring unavailable', { status: 503, headers: cors }); }
  }
  const eventType = isEdgeError ? 'edge_error' : body.event_type === 'auth_anomaly' ? 'auth_anomaly' : body.event_type === 'client_error' ? 'client_error' : null;
  if (!eventType) return new Response('Unsupported event', { status: 400, headers: cors });
  const errorClass = typeof body.error_class === 'string' && errorClasses.has(body.error_class) ? body.error_class : 'UnknownError';
  const moduleName = typeof body.module === 'string' && modules.has(body.module) ? body.module : 'other';
  const environment = typeof body.environment === 'string' && environments.has(body.environment) ? body.environment : 'other';
  const { error } = await client.from('monitoring_events').insert({ event_type: eventType, error_class: errorClass, module: moduleName, environment });
  if (error) return new Response('Event could not be recorded', { status: 503, headers: cors });
  return Response.json({ recorded: true }, { status: 202, headers: cors });
});
