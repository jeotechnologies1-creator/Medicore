import { createClient } from '../_shared/supabase.ts';
import { checkRateLimit, constantTimeEqual, parseConnectorConfig, verifySignedTimestamp } from '../_shared/security.ts';
import { connectorTokenEnvironment, normalizeGatewayWebhook, verifyGatewayPayment } from '../_shared/payment_gateway_adapters.ts';
import { verifyFlutterwaveSignature, verifyPaystackSignature } from '../_shared/payment_webhook_signatures.ts';

const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const encoder = new TextEncoder();
const uuidPattern = /^[0-9a-f-]{36}$/i;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const connectionSuffix = (id: string) => id.replaceAll('-', '').toUpperCase();

async function lookupGatewayTransaction(connectionId: string, fields: Record<string, unknown>) {
  const candidates = [
    ['provider_reference', fields.provider_reference], ['provider_transaction_id', fields.provider_transaction_id],
    ['provider_external_reference', fields.provider_external_reference], ['id', fields.medicore_transaction_id],
  ] as const;
  for (const [column, raw] of candidates) {
    const value = raw === undefined || raw === null ? '' : String(raw);
    if (!value) continue;
    const query = await serviceClient.from('payment_provider_transactions').select('*').eq('connection_id', connectionId).eq(column, value).limit(1).maybeSingle();
    if (query.error) throw new Error('Payment transaction lookup failed');
    if (query.data) return query.data as Record<string, unknown>;
  }
  return null;
}

async function handleVendorGatewayWebhook(connectionId: string, providerCode: string, body: string, headers: Headers) {
  const suffix = connectionSuffix(connectionId);
  const config = parseConnectorConfig(Deno.env.get('MEDICORE_CONNECTORS_JSON') ?? '{}');
  const connector = record(config[providerCode]);
  let token: string | undefined;
  try { token = Deno.env.get(connectorTokenEnvironment(connector, connectionId)); } catch { token = undefined; }
  let signatureValid = false;
  if (providerCode === 'paystack') {
    const signingSecrets = (Deno.env.get(`MEDICORE_PAYSTACK_WEBHOOK_SECRET_${suffix}`) ?? '').split(',').map((value) => value.trim()).filter(Boolean);
    signatureValid = await verifyPaystackSignature(body, headers, token, signingSecrets);
  } else {
    const secretHash = Deno.env.get(`MEDICORE_FLUTTERWAVE_WEBHOOK_SECRET_${suffix}`);
    const scheme = Deno.env.get(`MEDICORE_FLUTTERWAVE_WEBHOOK_SCHEME_${suffix}`) ?? 'v4';
    signatureValid = await verifyFlutterwaveSignature(body, headers, secretHash, scheme);
  }
  if (!signatureValid) return new Response('Invalid provider signature', { status: 401 });

  let event: Record<string, unknown>;
  try { event = JSON.parse(body); } catch { return new Response('Invalid JSON', { status: 400 }); }
  const normalized = normalizeGatewayWebhook(providerCode, event);
  if (!normalized) return Response.json({ accepted: true, ignored: true });
  const paymentData = normalized.data;
  const tokenValue = token ?? '';

  if (normalized.kind === 'payment' || normalized.kind === 'payment_failed') {
    if (!tokenValue) return new Response('Payment verification is not configured', { status: 503 });
    const eventData = record(event.data);
    const metadata = record(eventData.meta ?? eventData.metadata);
    let transaction = await lookupGatewayTransaction(connectionId, { ...paymentData, medicore_transaction_id: metadata.medicore_transaction_id });
    if (!transaction && typeof paymentData.provider_reference === 'string' && /^MC-[0-9a-f]{32}$/i.test(paymentData.provider_reference)) {
      const compact = paymentData.provider_reference.slice(3);
      const id = `${compact.slice(0,8)}-${compact.slice(8,12)}-${compact.slice(12,16)}-${compact.slice(16,20)}-${compact.slice(20)}`;
      transaction = await lookupGatewayTransaction(connectionId, { medicore_transaction_id: id });
    }
    if (!transaction) return new Response('Payment transaction is not registered', { status: 422 });
    let verification: Awaited<ReturnType<typeof verifyGatewayPayment>>;
    const transactionToVerify = { ...transaction, provider_transaction_id: paymentData.provider_transaction_id ?? transaction.provider_transaction_id };
    try { verification = await verifyGatewayPayment(providerCode, tokenValue, transactionToVerify); }
    catch { return new Response('Payment could not be verified', { status: 422 }); }
    const succeeded = normalized.kind === 'payment' && verification.succeeded;
    const updateFields: Record<string, unknown> = { provider_transaction_id: verification.providerTransactionId || transaction.provider_transaction_id };
    if (providerCode === 'flutterwave') updateFields.provider_external_reference = String(eventData.flw_ref ?? transaction.provider_external_reference ?? '');
    const { error: transactionUpdateError } = await serviceClient.from('payment_provider_transactions').update(updateFields).eq('id', transaction.id);
    if (transactionUpdateError) return new Response('Verified payment could not be recorded', { status: 503 });
    const { error } = await serviceClient.rpc('process_finance_integration_event', {
      p_connection_id: connectionId, p_event_id: normalized.eventId, p_event_type: succeeded ? 'payment.succeeded' : 'payment.failed',
      payload: { transaction_id: transaction.id, external_reference: verification.externalReference },
    });
    if (error) return Response.json({ error: 'Verified gateway event was rejected' }, { status: 422 });
    return Response.json({ accepted: true });
  }

  if (normalized.kind.startsWith('dispute_')) {
    const raw = paymentData;
    const nestedTransaction = record(raw.transaction);
    const transaction = await lookupGatewayTransaction(connectionId, {
      provider_reference: raw.reference ?? raw.tx_ref ?? nestedTransaction.reference ?? nestedTransaction.tx_ref,
      provider_transaction_id: raw.transaction_id ?? nestedTransaction.id ?? (typeof raw.transaction === 'string' || typeof raw.transaction === 'number' ? raw.transaction : undefined),
      provider_external_reference: raw.flw_ref ?? nestedTransaction.flw_ref,
      medicore_transaction_id: record(raw.meta).medicore_transaction_id ?? record(raw.metadata).medicore_transaction_id,
    });
    if (!transaction) return new Response('Dispute transaction is not registered', { status: 422 });
    const amount = Number(raw.amount ?? transaction.amount);
    const normalizedAmount = providerCode === 'paystack' ? amount / 100 : amount;
    const eventType = normalized.kind === 'dispute_opened' ? 'payment.dispute.opened' : normalized.kind === 'dispute_closed' ? 'payment.dispute.closed' : 'payment.dispute.updated';
    const due = raw.response_due_at ?? raw.due_date ?? raw.due_at;
    const { error } = await serviceClient.rpc('process_payment_dispute_event', {
      p_connection_id: connectionId, p_event_id: normalized.eventId, p_event_type: eventType,
      payload: { transaction_id: transaction.id, dispute_id: String(raw.id ?? raw.dispute_id ?? ''), amount: normalizedAmount,
        currency: transaction.currency, reason: raw.reason ?? raw.comment ?? raw.message ?? null, response_due_at: due ?? null },
    });
    if (error) return Response.json({ error: 'Dispute event was rejected' }, { status: 422 });
    return Response.json({ accepted: true });
  }

  if (normalized.kind === 'refund') {
    const raw = record(event.data);
    const providerReference = String(paymentData.provider_reference ?? raw.reference ?? '');
    let refund: Record<string, unknown> | null = null;
    if (providerReference) {
      const refundResult = await serviceClient.from('gateway_refund_requests').select('*').eq('connection_id', connectionId).eq('refund_reference', providerReference).maybeSingle();
      if (refundResult.error) return new Response('Refund lookup failed', { status: 503 });
      refund = refundResult.data as Record<string, unknown> | null;
    }
    if (!refund && raw.id !== undefined) {
      const byProviderId = await serviceClient.from('gateway_refund_requests').select('*').eq('connection_id', connectionId).eq('provider_refund_id', String(raw.id)).maybeSingle();
      if (!byProviderId.error && byProviderId.data) refund = byProviderId.data as Record<string, unknown>;
    }
    if (!refund && (raw.provider_transaction_id || raw.transaction_id)) {
      const transaction = await lookupGatewayTransaction(connectionId, { provider_transaction_id: raw.provider_transaction_id ?? raw.transaction_id });
      if (transaction) {
        const fallback = await serviceClient.from('gateway_refund_requests').select('*').eq('connection_id', connectionId).eq('payment_provider_transaction_id', transaction.id).in('status', ['queued','submitted','processing']).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!fallback.error && fallback.data) refund = fallback.data as Record<string, unknown>;
      }
    }
    if (!refund && (raw.transaction !== undefined || raw.transaction_id !== undefined)) {
      const transactionValue = typeof raw.transaction === 'object' ? record(raw.transaction).id : raw.transaction;
      const transaction = await lookupGatewayTransaction(connectionId, {
        provider_reference: typeof raw.transaction === 'object' ? record(raw.transaction).reference : undefined,
        provider_transaction_id: raw.transaction_id ?? transactionValue,
      });
      if (transaction) {
        const fallback = await serviceClient.from('gateway_refund_requests').select('*').eq('connection_id', connectionId).eq('payment_provider_transaction_id', transaction.id).in('status', ['queued','submitted','processing']).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!fallback.error && fallback.data) refund = fallback.data as Record<string, unknown>;
      }
    }
    if (!refund) return new Response('Gateway refund is not registered', { status: 422 });
    const rawStatus = String(paymentData.status ?? raw.status ?? 'processing').toLowerCase().replaceAll('-', '_');
    const status = ['processed','successful','completed','completed_bank_transfer','completed_momo','completed_mpgs','completed_offline','completed_preauth'].includes(rawStatus) ? 'processed'
      : ['failed','failure'].includes(rawStatus) ? 'failed'
        : rawStatus === 'needs_attention' ? 'needs_attention' : 'processing';
    const { error } = await serviceClient.rpc('process_payment_refund_event', {
      p_connection_id: connectionId, p_event_id: normalized.eventId,
      payload: { refund_id: refund.id, status, provider_refund_id: raw.id === undefined ? null : String(raw.id), response: raw },
    });
    if (error) return Response.json({ error: 'Refund event was rejected' }, { status: 422 });
    return Response.json({ accepted: true });
  }
  return Response.json({ accepted: true, ignored: true });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const url = new URL(request.url);
  const connectionId = request.headers.get('x-medicore-connection') ?? url.searchParams.get('connection_id');
  if (!connectionId || !uuidPattern.test(connectionId)) return new Response('Missing integration connection', { status: 400 });
  try {
    if (!await checkRateLimit(serviceClient, request, 'integration-webhook', null, 120, 60)) return new Response('Rate limit exceeded', { status: 429 });
  } catch { return new Response('Rate limiting is temporarily unavailable', { status: 503 }); }
  const body = await request.text();
  if (encoder.encode(body).length > 1_000_000) return new Response('Payload too large', { status: 413 });
  const { data: connection, error: connectionError } = await serviceClient.from('integration_connections').select('id,provider_code,integration_type,status').eq('id', connectionId).maybeSingle();
  if (connectionError || !connection || connection.status !== 'active') return new Response('Integration connection not found', { status: 404 });
  if (connection.integration_type === 'payment_gateway' && ['paystack','flutterwave'].includes(connection.provider_code)) {
    return await handleVendorGatewayWebhook(connectionId, connection.provider_code, body, request.headers);
  }

  const timestampHeader = request.headers.get('x-provider-timestamp');
  const timestamp = verifySignedTimestamp(timestampHeader);
  const signature = request.headers.get('x-provider-signature')?.replace(/^sha256=/, '');
  if (timestamp === null || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return new Response('Invalid webhook headers or stale timestamp', { status: 400 });
  const secretEnv = `MEDICORE_WEBHOOK_SECRET_${connectionSuffix(connectionId)}`;
  const secret = Deno.env.get(secretEnv);
  if (!secret) return new Response('Webhook is not configured', { status: 404 });
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestampHeader}.${body}`)))].map((value) => value.toString(16).padStart(2, '0')).join('');
  if (!await constantTimeEqual(signature.toLowerCase(), expected)) return new Response('Invalid signature', { status: 401 });
  let event: Record<string, unknown>;
  try { event = JSON.parse(body); } catch { return new Response('Invalid JSON', { status: 400 }); }
  const eventTypes = ['payment.succeeded', 'payment.failed', 'payer.claim.accepted', 'payer.claim.adjudicated', 'payer.claim.denied', 'payer.remittance', 'payer.eligibility.result', 'payer.preauthorization.updated', 'payment.dispute.opened', 'payment.dispute.updated', 'payment.dispute.closed'];
  if (typeof event.event_id !== 'string' || event.event_id.length < 1 || event.event_id.length > 200 || typeof event.event_type !== 'string' || !eventTypes.includes(event.event_type) || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return new Response('Invalid event shape', { status: 400 });
  const rpc = event.event_type.startsWith('payment.dispute.') ? 'process_payment_dispute_event' : (event.event_type === 'payer.eligibility.result' || event.event_type === 'payer.preauthorization.updated' || event.event_type === 'payer.claim.denied') ? 'process_payer_workflow_event' : 'process_finance_integration_event';
  const { error } = await serviceClient.rpc(rpc, { p_connection_id: connectionId, p_event_id: event.event_id, p_event_type: event.event_type, payload: event.data });
  if (error) return Response.json({ error: 'Event rejected' }, { status: 422 });
  return Response.json({ accepted: true });
});
