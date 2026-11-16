export type GatewayPayload = Record<string, unknown>;

export const paymentGatewayApi = {
  paystack: 'https://api.paystack.co',
  flutterwave: 'https://api.flutterwave.com/v3',
} as const;

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function connectorTokenEnvironment(connector: Record<string, unknown>, connectionId: string): string {
  const byConnection = record(connector.tokenEnvByConnection);
  const name = byConnection[connectionId] ?? connector.tokenEnv;
  if (typeof name !== 'string' || !/^[A-Z_][A-Z0-9_]*$/.test(name)) throw new Error('Connector token environment variable is not configured');
  return name;
}
const minorUnits = (amount: unknown) => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Payment amount must be positive');
  return String(Math.round(parsed * 100));
};
const requireTestKey = (provider: string, mode: unknown, token: string) => {
  if (mode !== 'test') return;
  const valid = provider === 'paystack' ? /^(sk|rk)_test_/.test(token) : /^FLWSECK_TEST-/.test(token);
  if (!valid) throw new Error(`Test mode requires a ${provider} test secret key`);
};
const apiResponse = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Payment provider returned HTTP ${response.status}`);
  return record(body);
};

export async function dispatchPaymentGatewayEvent(
  providerCode: string,
  connector: Record<string, unknown>,
  token: string,
  eventType: string,
  payload: GatewayPayload,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  if (providerCode !== 'paystack' && providerCode !== 'flutterwave') throw new Error('Unsupported payment gateway provider');
  const provider = providerCode;
  requireTestKey(provider, connector.mode ?? 'test', token);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' };

  if (eventType === 'payment.intent.create') {
    const transactionId = String(payload.transaction_id ?? '');
    const idempotencyKey = String(payload.idempotency_key ?? '');
    const reference = `MC-${transactionId.replaceAll('-', '')}`;
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(reference) || !idempotencyKey) throw new Error('Payment intent is missing a stable reference');
    const customer = record(payload.customer);
    const callbackUrl = typeof connector.returnUrl === 'string' ? connector.returnUrl : undefined;
    if (callbackUrl && new URL(callbackUrl).protocol !== 'https:') throw new Error('Gateway return URL must use HTTPS');
    if (provider === 'paystack') {
      const body = { email: String(customer.email ?? ''), amount: minorUnits(payload.amount), currency: String(payload.currency ?? 'NGN'), reference,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}), metadata: { medicore_transaction_id: transactionId, idempotency_key: idempotencyKey } };
      const result = await apiResponse(await fetcher(`${paymentGatewayApi.paystack}/transaction/initialize`, { method: 'POST', headers: { ...headers, 'idempotency-key': idempotencyKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }));
      if (result.status !== true) throw new Error('Paystack did not initialize the transaction');
      const data = record(result.data);
      if (typeof data.authorization_url !== 'string' || !data.authorization_url.startsWith('https://')) throw new Error('Paystack response did not include a secure checkout URL');
      return { ...(typeof data.id === 'string' || typeof data.id === 'number' ? { id: String(data.id) } : {}), reference: String(data.reference ?? reference), checkout_url: data.authorization_url };
    }
    const body = { amount: Number(payload.amount), tx_ref: reference, currency: String(payload.currency ?? 'NGN'), customer: { email: String(customer.email ?? ''), name: String(customer.name ?? 'Patient') },
      ...(callbackUrl ? { redirect_url: callbackUrl } : {}), meta: { medicore_transaction_id: transactionId, idempotency_key: idempotencyKey } };
    const result = await apiResponse(await fetcher(`${paymentGatewayApi.flutterwave}/payments`, { method: 'POST', headers: { ...headers, 'X-Idempotency-Key': idempotencyKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }));
    if (result.status !== 'success') throw new Error('Flutterwave did not initialize the transaction');
    const data = record(result.data);
    if (typeof data.link !== 'string' || !data.link.startsWith('https://')) throw new Error('Flutterwave response did not include a secure checkout URL');
    return { reference, checkout_url: data.link };
  }

  if (eventType === 'payment.refund.create') {
    const idempotencyKey = String(payload.idempotency_key ?? '');
    if (!idempotencyKey || !payload.provider_reference) throw new Error('Refund request is missing the provider reference or idempotency key');
    if (provider === 'paystack') {
      const refundReference = String(payload.refund_reference ?? '');
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(refundReference)) throw new Error('Paystack refund reference is invalid');
      const result = await apiResponse(await fetcher(`${paymentGatewayApi.paystack}/refund`, { method: 'POST', headers: { ...headers, 'idempotency-key': idempotencyKey }, body: JSON.stringify({ transaction: payload.provider_reference, amount: Number(minorUnits(payload.amount)), reference: refundReference }), signal: AbortSignal.timeout(15000) }));
      if (result.status !== true) throw new Error('Paystack did not accept the refund request');
      const data = record(result.data);
      return { id: data.id === undefined ? '' : String(data.id), reference: String(data.reference ?? refundReference), status: String(data.status ?? 'pending') };
    }
    const transactionId = String(payload.provider_transaction_id ?? '');
    if (!/^\d+$/.test(transactionId)) throw new Error('Flutterwave refund requires its numeric transaction ID');
    const result = await apiResponse(await fetcher(`${paymentGatewayApi.flutterwave}/transactions/${encodeURIComponent(transactionId)}/refund`, { method: 'POST', headers: { ...headers, 'X-Idempotency-Key': idempotencyKey }, body: JSON.stringify({ amount: Number(payload.amount), comments: `Medicore refund ${String(payload.refund_reference ?? '')}` }), signal: AbortSignal.timeout(15000) }));
    if (result.status !== 'success') throw new Error('Flutterwave did not accept the refund request');
    const data = record(result.data);
    return { id: data.id === undefined ? '' : String(data.id), reference: String(data.flw_ref ?? payload.refund_reference ?? ''), status: String(data.status ?? 'processing') };
  }
  throw new Error(`Unsupported gateway event type: ${eventType}`);
}

export async function verifyGatewayPayment(
  providerCode: string, token: string, transaction: Record<string, unknown>, fetcher: typeof fetch = fetch,
): Promise<{ succeeded: boolean; externalReference: string; providerTransactionId: string }> {
  if (providerCode === 'paystack') {
    const reference = String(transaction.provider_reference ?? '');
    if (!reference) throw new Error('Paystack transaction reference is missing');
    const result = await apiResponse(await fetcher(`${paymentGatewayApi.paystack}/transaction/verify/${encodeURIComponent(reference)}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }));
    const data = record(result.data);
    const ok = result.status === true && data.status === 'success' && data.reference === reference && data.currency === transaction.currency && Number(data.amount) >= Math.round(Number(transaction.amount) * 100);
    if (data.reference !== reference || data.currency !== transaction.currency || Number(data.amount) < Math.round(Number(transaction.amount) * 100)) throw new Error('Paystack verification did not match the expected transaction');
    return { succeeded: ok, externalReference: reference, providerTransactionId: String(data.id ?? '') };
  }
  if (providerCode === 'flutterwave') {
    const id = String(transaction.provider_transaction_id ?? '');
    if (!/^\d+$/.test(id)) throw new Error('Flutterwave transaction ID is missing');
    const result = await apiResponse(await fetcher(`${paymentGatewayApi.flutterwave}/transactions/${encodeURIComponent(id)}/verify`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }));
    const data = record(result.data);
    if (String(data.tx_ref ?? '') !== String(transaction.provider_reference ?? '') || data.currency !== transaction.currency || Number(data.amount) < Number(transaction.amount)) throw new Error('Flutterwave verification did not match the expected transaction');
    return { succeeded: result.status === 'success' && data.status === 'successful', externalReference: String(data.flw_ref ?? data.tx_ref), providerTransactionId: String(data.id ?? id) };
  }
  throw new Error('Unsupported payment gateway provider');
}

export function normalizeGatewayWebhook(providerCode: string, event: Record<string, unknown>): { kind: string; eventId: string; data: Record<string, unknown> } | null {
  const data = record(event.data);
  const eventName = String(event.event ?? '');
  const id = String(data.id ?? data.reference ?? data.tx_ref ?? 'unknown');
  if (providerCode === 'paystack') {
    if (eventName === 'charge.success') return { kind: 'payment', eventId: `${eventName}:${id}`, data: { provider_reference: data.reference } };
    if (eventName === 'charge.failed') return { kind: 'payment_failed', eventId: `${eventName}:${id}`, data: { provider_reference: data.reference } };
    if (eventName.startsWith('refund.')) return { kind: 'refund', eventId: `${eventName}:${id}`, data: { provider_reference: data.reference, status: eventName.slice('refund.'.length).replaceAll('-', '_') } };
    if (eventName === 'charge.dispute.create' || eventName === 'charge.dispute.remind' || eventName === 'charge.dispute.resolve') return { kind: eventName.endsWith('resolve') ? 'dispute_closed' : eventName.endsWith('create') ? 'dispute_opened' : 'dispute_updated', eventId: `${eventName}:${id}`, data };
  }
  if (providerCode === 'flutterwave') {
    if (eventName === 'charge.completed') return { kind: data.status === 'successful' ? 'payment' : 'payment_failed', eventId: `${eventName}:${id}`, data: { provider_reference: data.tx_ref, provider_transaction_id: data.id } };
    if (eventName.startsWith('refund.')) return { kind: 'refund', eventId: `${eventName}:${id}`, data: { provider_reference: data.flw_ref ?? data.reference, status: data.status ?? eventName.slice('refund.'.length).replaceAll('-', '_') } };
    if (eventName === 'chargeback.initiated' || eventName === 'chargeback.updated' || eventName === 'chargeback.accepted' || eventName === 'chargeback.declined' || eventName === 'chargeback.won' || eventName === 'chargeback.lost') {
      const state = String(data.status ?? eventName.slice('chargeback.'.length));
      return { kind: ['accepted','won','lost'].includes(state) ? 'dispute_closed' : eventName === 'chargeback.initiated' ? 'dispute_opened' : 'dispute_updated', eventId: `${eventName}:${id}`, data };
    }
  }
  return null;
}
