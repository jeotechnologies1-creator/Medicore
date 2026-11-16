import { checkRateLimit, constantTimeEqual, mapBounded, parseConnectorConfig, reportSafeEdgeError } from '../_shared/security.ts';

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;
};

type HandlerOptions = {
  client: RpcClient;
  serviceKey: string;
  connectorJson: string;
  appLoginUrl: string | undefined;
  environmentValue: (name: string) => string | undefined;
  fetcher?: typeof fetch;
  reportError?: typeof reportSafeEdgeError;
};

const CRITICAL_TEMPLATE = 'critical_result_acknowledgement';
const CRITICAL_MESSAGE = 'A critical result is awaiting acknowledgement.';

const safeLoginUrl = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return parsed.toString();
  } catch { return null; }
};

export const createNotificationDispatchHandler = (options: HandlerOptions) => {
  const fetcher = options.fetcher || fetch;
  const reportError = options.reportError || reportSafeEdgeError;

  return async (request: Request): Promise<Response> => {
    const authorization = request.headers.get('authorization') ?? '';
    if (request.method !== 'POST' || !await constantTimeEqual(authorization, `Bearer ${options.serviceKey}`)) {
      return new Response('Unauthorized', { status: 401 });
    }
    try {
      if (!await checkRateLimit(options.client, request, 'notification-dispatch', 'service-scheduler', 120, 60)) return new Response('Rate limit exceeded', { status: 429 });
    } catch { return new Response('Rate limiting is temporarily unavailable', { status: 503 }); }

    let config: Record<string, unknown>;
    try {
      config = parseConnectorConfig(options.connectorJson);
    } catch (error) {
      await reportError('notification', error);
      return Response.json({ error: 'Notification connector configuration is invalid' }, { status: 500 });
    }
    let limit = 25;
    try {
      const body = await request.json();
      limit = Math.max(1, Math.min(100, Number(body.limit) || 25));
    } catch { /* use bounded default */ }

    const { data: messages, error } = await options.client.rpc('claim_outbound_messages', { p_limit: limit });
    if (error) return Response.json({ error: 'Unable to lease outbound messages' }, { status: 500 });
    const results = await mapBounded((messages ?? []) as Record<string, unknown>[], 5, async (message) => {
      let ok = false;
      try {
        const payload = message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)
          ? message.payload as Record<string, unknown>
          : {};
        let outboundPayload: Record<string, unknown> = payload;
        if (message.template === CRITICAL_TEMPLATE) {
          const loginUrl = safeLoginUrl(options.appLoginUrl);
          if (payload.message !== CRITICAL_MESSAGE || typeof payload.reference !== 'string' || !loginUrl || Object.keys(payload).some((key) => !['message', 'reference'].includes(key))) {
            throw new Error('Critical notification is missing safe message configuration');
          }
          outboundPayload = { message: CRITICAL_MESSAGE, reference: payload.reference, login_url: loginUrl };
        }
        if (typeof config.endpoint !== 'string' || typeof config.tokenEnv !== 'string') throw new Error('Connector is not configured');
        const endpoint = new URL(config.endpoint);
        if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== 'host.docker.internal') throw new Error('Connector URL must use HTTPS');
        const token = options.environmentValue(config.tokenEnv);
        if (!token) throw new Error('Connector credential is missing');
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': String(message.id) },
          body: JSON.stringify({ channel: message.channel, recipient: message.recipient, template: message.template, payload: outboundPayload }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`Connector returned HTTP ${response.status}`);
        ok = true;
      } catch (cause) {
        await reportError('notification', cause);
      }
      const { error: saveError } = await options.client.rpc('complete_outbound_message', {
        p_id: message.id,
        p_lease: message.lease_token,
        p_ok: ok,
        p_error: ok ? null : 'Notification delivery failed',
      });
      return { id: message.id, delivered: ok && !saveError };
    });
    return Response.json({ processed: results.length, results });
  };
};
