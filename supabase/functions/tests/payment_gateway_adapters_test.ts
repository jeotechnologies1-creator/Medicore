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

Deno.test('vendor signatures follow Paystack timestamped and legacy schemes and Flutterwave configured schemes', async () => {
  const body = '{"event":"charge.success"}';
  const secret = 'whsec_fixture_secret';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)))].map((value) => value.toString(16).padStart(2, '0')).join('');
  if (!await verifyPaystackSignature(body, new Headers({ 'Paystack-Signature': `t=${timestamp},v1=whk_fixture:${signature}` }), undefined, [secret])) throw new Error('Paystack timestamped signature rejected');
  const flwKey = await crypto.subtle.importKey('raw', new TextEncoder().encode('flw_fixture'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', flwKey, new TextEncoder().encode(body)));
  const signatureBase64 = btoa(Array.from(digest, (value) => String.fromCharCode(value)).join(''));
  if (!await verifyFlutterwaveSignature(body, new Headers({ 'flutterwave-signature': signatureBase64 }), 'flw_fixture', 'hmac-sha256-base64')) throw new Error('Flutterwave HMAC signature rejected');
  if (!await verifyFlutterwaveSignature(body, new Headers({ 'verif-hash': 'flw_fixture' }), 'flw_fixture', 'v3')) throw new Error('Flutterwave v3 verif-hash rejected');
});
