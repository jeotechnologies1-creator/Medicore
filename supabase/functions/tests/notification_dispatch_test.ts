import { createNotificationDispatchHandler } from '../notification-dispatch/handler.ts';
import { createMockNotificationConnector } from './mock_notification_connector.ts';

const message = {
  id: '94000000-0000-4000-8000-000000000001',
  lease_token: '94000000-0000-4000-8000-000000000002',
  channel: 'email',
  recipient: 'clinician@example.invalid',
  template: 'critical_result_acknowledgement',
  payload: {
    message: 'A critical result is awaiting acknowledgement.',
    reference: '94000000-0000-4000-8000-000000000003',
  },
};

Deno.test('notification dispatch sends the PHI-minimized template through the local mock connector', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === 'consume_edge_rate_limit') return { data: true, error: null };
    if (name === 'claim_outbound_messages') return { data: [message], error: null };
    if (name === 'complete_outbound_message') return { data: true, error: null };
    return { data: null, error: new Error('unexpected rpc') };
  } };
  const mock = createMockNotificationConnector('mock-token');
  const handler = createNotificationDispatchHandler({
    client,
    serviceKey: 'server-only-key',
    connectorJson: '{"endpoint":"https://mock-connector.invalid/notify","tokenEnv":"MOCK_TOKEN"}',
    appLoginUrl: 'https://emr.example.invalid/login',
    environmentValue: (name) => name === 'MOCK_TOKEN' ? 'mock-token' : undefined,
    fetcher: mock.fetcher,
    reportError: async () => {},
  });

  const response = await handler(new Request('https://edge.example.invalid/notification-dispatch', {
    method: 'POST',
    headers: { authorization: 'Bearer server-only-key', 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 10 }),
  }));
  const result = await response.json();
  const request = mock.requests[0];
  const envelope = await request.json();
  const payload = envelope.payload as Record<string, unknown>;
  const completion = calls.find((call) => call.name === 'complete_outbound_message')?.args;

  if (response.status !== 200 || result.processed !== 1 || result.results[0].delivered !== true) throw new Error('mock notification was not delivered');
  if (request.url !== 'https://mock-connector.invalid/notify' || envelope.template !== 'critical_result_acknowledgement') throw new Error('connector request was malformed');
  if (payload.message !== 'A critical result is awaiting acknowledgement.' || payload.reference !== message.payload.reference || payload.login_url !== 'https://emr.example.invalid/login') throw new Error('critical notification content is incorrect');
  if (Object.keys(payload).sort().join(',') !== 'login_url,message,reference') throw new Error('critical payload contains extra fields');
  if (JSON.stringify(payload).match(/patient|diagnosis|result_value/i)) throw new Error('critical payload contains clinical data');
  if (completion?.p_ok !== true) throw new Error('delivery result was not persisted');
});

Deno.test('critical message is retried safely when app login URL is not configured', async () => {
  let completion: Record<string, unknown> | undefined;
  let connectorCalls = 0;
  const client = { rpc: async (name: string, _args: Record<string, unknown>) => {
    if (name === 'consume_edge_rate_limit') return { data: true, error: null };
    if (name === 'claim_outbound_messages') return { data: [message], error: null };
    if (name === 'complete_outbound_message') { completion = _args; return { data: true, error: null }; }
    return { data: null, error: null };
  } };
  const handler = createNotificationDispatchHandler({
    client,
    serviceKey: 'server-only-key',
    connectorJson: '{"endpoint":"https://mock-connector.invalid/notify","tokenEnv":"MOCK_TOKEN"}',
    appLoginUrl: undefined,
    environmentValue: () => 'mock-token',
    fetcher: async () => { connectorCalls++; return new Response(null, { status: 202 }); },
    reportError: async () => {},
  });
  const response = await handler(new Request('https://edge.example.invalid/notification-dispatch', {
    method: 'POST', headers: { authorization: 'Bearer server-only-key' }, body: '{}',
  }));
  if (response.status !== 200 || connectorCalls !== 0 || completion?.p_ok !== false || completion?.p_error !== 'Notification delivery failed') {
    throw new Error('missing login URL was not safely recorded as an undelivered message');
  }
});
