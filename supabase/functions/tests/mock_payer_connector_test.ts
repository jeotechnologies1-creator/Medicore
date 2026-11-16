import { createMockPayerConnector } from '../_shared/mock_payer_connector.ts';

Deno.test('mock payer connector supports eligibility, preauthorization, claims and idempotent retries', async () => {
  const mock = createMockPayerConnector();
  const send = (path: string, key: string) => mock.fetch(`https://mock.invalid/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify({ canonical: true }),
  });
  const eligibility = await (await send('eligibility', 'elig-1')).json();
  const preauth = await (await send('preauthorizations', 'auth-1')).json();
  const claim = await (await send('claims', 'claim-1')).json();
  await send('claims', 'claim-1');
  if (eligibility.status !== 'eligible' || preauth.status !== 'approved' || claim.status !== 'accepted' || mock.requestCount !== 3) {
    throw new Error('mock payer normalized response or idempotency behavior failed');
  }
});
