import { dispatchPaymentGatewayEvent, normalizeGatewayWebhook, verifyGatewayPayment } from '../_shared/payment_gateway_adapters.ts';
import { verifyFlutterwaveSignature, verifyPaystackSignature } from '../_shared/payment_webhook_signatures.ts';

const fixture = async (name: string) => JSON.parse(await Deno.readTextFile(new URL(`./fixtures/${name}`, import.meta.url)));

Deno.test('Paystack adapter creates a stable sandbox checkout reference and maps documented response fields', async () => {
  let sent: Record<string, unknown> = {};
  const result = await dispatchPaymentGatewayEvent('paystack', { mode: 'test', returnUrl: 'https://clinic.example/return' }, 'sk_test_fixture', 'payment.intent.create', {
    transaction_id: '00000000-0000-4000-8000-000000000001', idempotency_key: 'intent-one', amount: 125, currency: 'NGN', customer: { email: 'fixture@example.test', name: 'Test Patient' },
  }, async (input, init) => {
    sent = { url: String(input), headers: init?.headers, body: JSON.parse(String(init?.body)) };
    return Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/test-link', reference: 'MC-00000000000040008000000000000001' } });
  });
  const body = sent.body as Record<string, unknown>;
  if (!String(sent.url).endsWith('/transaction/initialize') || body.amount !== '12500' || body.reference !== 'MC-00000000000040008000000000000001' || result.checkout_url !== 'https://checkout.paystack.com/test-link') throw new Error('Paystack checkout adapter mapping failed');
  if (!String((sent.headers as Record<string, string>)['idempotency-key']).includes('intent-one')) throw new Error('Paystack idempotency header missing');
});

Deno.test('Flutterwave adapter uses its hosted checkout request and test key only', async () => {
  let sent: Record<string, unknown> = {};
  const result = await dispatchPaymentGatewayEvent('flutterwave', { mode: 'test' }, 'FLWSECK_TEST-fixture', 'payment.intent.create', {
    transaction_id: '00000000-0000-4000-8000-000000000002', idempotency_key: 'intent-two', amount: 125, currency: 'NGN', customer: { email: 'fixture@example.test', name: 'Test Patient' },
  }, async (input, init) => {
    sent = { url: String(input), headers: init?.headers, body: JSON.parse(String(init?.body)) };
    return Response.json({ status: 'success', data: { link: 'https://checkout.flutterwave.com/mock-link' } });
  });
  const body = sent.body as Record<string, unknown>;
  if (!String(sent.url).endsWith('/v3/payments') || body.amount !== 125 || body.tx_ref !== 'MC-00000000000040008000000000000002' || result.checkout_url !== 'https://checkout.flutterwave.com/mock-link') throw new Error('Flutterwave checkout adapter mapping failed');
  let liveKeyRejected = false;
  try { await dispatchPaymentGatewayEvent('flutterwave', { mode: 'test' }, 'FLWSECK_LIVE-fixture', 'payment.intent.create', { transaction_id: '00000000-0000-4000-8000-000000000003', idempotency_key: 'intent-three', amount: 1, customer: { email: 'fixture@example.test' } }, fetch); } catch { liveKeyRejected = true; }
  if (!liveKeyRejected) throw new Error('Flutterwave test mode accepted a live key');
});

Deno.test('recorded Paystack and Flutterwave events normalize for internal payments, refunds and disputes', async () => {
  const [paystack, flutterwave, refund, dispute] = await Promise.all([
    fixture('paystack_charge_success.json'), fixture('flutterwave_charge_completed.json'), fixture('paystack_refund_processed.json'), fixture('flutterwave_chargeback_initiated.json'),
  ]);
  if (normalizeGatewayWebhook('paystack', paystack)?.kind !== 'payment' || normalizeGatewayWebhook('flutterwave', flutterwave)?.kind !== 'payment' || normalizeGatewayWebhook('paystack', refund)?.kind !== 'refund' || normalizeGatewayWebhook('flutterwave', dispute)?.kind !== 'dispute_opened') throw new Error('Recorded provider webhook fixtures were not normalized');
});

Deno.test('Paystack verifier checks provider amount, currency, and reference before confirming payment', async () => {
  const verified = await verifyGatewayPayment('paystack', 'sk_test_fixture', { provider_reference: 'MC-ref', amount: 125, currency: 'NGN' }, async () => Response.json({ status: true, data: { status: 'success', reference: 'MC-ref', amount: 12500, currency: 'NGN', id: 999 } }));
  if (!verified.succeeded || verified.providerTransactionId !== '999') throw new Error('Paystack transaction verification failed');
});

Deno.test('Paystack recorded sandbox fixture validates and rejects tampered, replayed, stale and downgraded requests', async () => {
  const recorded = await fixture('paystack_charge_success.json');
  const body = JSON.stringify(recorded);
  const secret = 'whsec_test_fixture_only';
  const now = 1_800_000_000;
  const timestamp = String(now);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)))].map((value) => value.toString(16).padStart(2, '0')).join('');
  const headers = new Headers({ 'Paystack-Signature': `t=${timestamp},v1=whk_test_fixture:${signature}` });
  if (!await verifyPaystackSignature(body, headers, undefined, [secret], now)) throw new Error('Paystack timestamped sandbox fixture rejected');
  if (!await verifyPaystackSignature(body, headers, undefined, [secret], now)) throw new Error('Byte-identical Paystack retry should authenticate and be deduplicated by event ID');
  if (await verifyPaystackSignature(`${body} `, headers, undefined, [secret], now)) throw new Error('Tampered Paystack body accepted');
  if (await verifyPaystackSignature(body, headers, undefined, [secret], now + 301)) throw new Error('Replayed/stale Paystack timestamp accepted');
  const legacyKey = await crypto.subtle.importKey('raw', new TextEncoder().encode('sk_test_legacy_fixture'), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const legacy = [...new Uint8Array(await crypto.subtle.sign('HMAC', legacyKey, new TextEncoder().encode(body)))].map((value) => value.toString(16).padStart(2, '0')).join('');
  if (await verifyPaystackSignature(body, new Headers({ 'Paystack-Signature': `t=${now - 301},v1=whk_test_fixture:${signature}`, 'x-paystack-signature': legacy }), 'sk_test_legacy_fixture', [secret], now)) throw new Error('Stale modern signature downgraded to legacy signature');
  const normalized = normalizeGatewayWebhook('paystack', recorded);
  if (!normalized || normalized.eventId !== normalizeGatewayWebhook('paystack', recorded)?.eventId) throw new Error('Paystack replay did not preserve a stable idempotency key');
});

Deno.test('Flutterwave recorded sandbox fixture validates HMAC and rejects tampering; legacy v3 is explicit', async () => {
  const recorded = await fixture('flutterwave_charge_completed.json');
  const body = JSON.stringify(recorded);
  const secret = 'flw_test_fixture_only';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const signature = btoa(Array.from(digest, (value) => String.fromCharCode(value)).join(''));
  const headers = new Headers({ 'flutterwave-signature': signature });
  if (!await verifyFlutterwaveSignature(body, headers, secret, undefined)) throw new Error('Preferred Flutterwave HMAC signature rejected');
  if (!await verifyFlutterwaveSignature(body, headers, secret, undefined)) throw new Error('Byte-identical Flutterwave retry should authenticate and be deduplicated by event ID');
  if (await verifyFlutterwaveSignature(`${body} `, headers, secret, undefined)) throw new Error('Tampered Flutterwave body accepted');
  if (!await verifyFlutterwaveSignature(body, new Headers({ 'verif-hash': secret }), secret, 'v3')) throw new Error('Explicit Flutterwave v3 verif-hash rejected');
  if (await verifyFlutterwaveSignature(body, new Headers({ 'verif-hash': secret }), secret, undefined)) throw new Error('Legacy Flutterwave scheme accepted without explicit configuration');
  const normalized = normalizeGatewayWebhook('flutterwave', recorded);
  if (!normalized || normalized.eventId !== normalizeGatewayWebhook('flutterwave', recorded)?.eventId) throw new Error('Flutterwave replay did not preserve a stable idempotency key');
});

Deno.test('recorded test-mode refund and dispute fixtures retain stable vendor event IDs', async () => {
  const [paystackRefund, flutterwaveDispute] = await Promise.all([
    fixture('paystack_refund_processed.json'), fixture('flutterwave_chargeback_initiated.json'),
  ]);
  const refund = normalizeGatewayWebhook('paystack', paystackRefund);
  const dispute = normalizeGatewayWebhook('flutterwave', flutterwaveDispute);
  if (refund?.kind !== 'refund' || refund.eventId !== 'refund.processed:700000001') throw new Error('Paystack refund fixture did not normalize idempotently');
  if (dispute?.kind !== 'dispute_opened' || dispute.eventId !== 'chargeback.initiated:600000001') throw new Error('Flutterwave dispute fixture did not normalize idempotently');
});
