import { assertEquals, assert } from 'jsr:@std/assert@1';
import { bundleForPage, createFhirHandler, mapPatient, MAX_COUNT, parsePageRequest } from '../fhir-r4/index.ts';

const facilityPatientIds = [
  'a5000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000002',
  'a5000000-0000-4000-8000-000000000003',
];

Deno.test('FHIR paging clamps _count, validates offsets, and returns a continuation link without a false total', () => {
  const page = parsePageRequest(new URL('https://example.test/fhir/Patient?_id=a5000000-0000-4000-8000-000000000001&_count=999'));
  assertEquals(page, { count: MAX_COUNT, offset: 0 });
  assertEquals(parsePageRequest(new URL('https://example.test/fhir/Patient?_count=0')), null);
  assertEquals(parsePageRequest(new URL('https://example.test/fhir/Patient?_offset=100001')), null);
  const resources = facilityPatientIds.map((id) => mapPatient({ id, first_name: 'Test', last_name: id.slice(-1), status: 'active' }));
  const firstPage = bundleForPage(resources, new URL('https://example.test/fhir/Patient?_id=test&_count=2'), { count: 2, offset: 0 });
  assertEquals(firstPage.entry.length, 2);
  assertEquals(firstPage.link.find((link) => link.relation === 'next')?.url.includes('_offset=2'), true);
  assertEquals('total' in firstPage, false);
  const secondPage = bundleForPage(resources, new URL(firstPage.link.find((link) => link.relation === 'next')!.url), { count: 2, offset: 2 });
  assertEquals(secondPage.entry.map((entry) => entry.resource.id), [facilityPatientIds[2]]);
  assertEquals(secondPage.link.some((link) => link.relation === 'next'), false);
});

function mockDatabase(authorizedIds: string[], exposeRows = true) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const rows = facilityPatientIds.map((_, index) => ({ id: `b5000000-0000-4000-8000-00000000000${index + 1}`, patient_id: facilityPatientIds[0], status: 'completed', encounter_type: 'outpatient', started_at: '2026-01-01T10:00:00Z' }));
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: 'test-user' } }, error: null }) },
    from(table: string) {
      let idFilter: unknown;
      let from = 0;
      let to = 199;
      const query = {
        select: () => query,
        eq: (_column: string, value: unknown) => { idFilter = value; return query; },
        order: () => query,
        range: (start: number, end: number) => { from = start; to = end; return query; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          const resultRows = exposeRows && table === 'encounters' ? rows.filter((row) => idFilter === undefined || row.patient_id === idFilter).slice(from, to + 1) : [];
          return Promise.resolve({ data: resultRows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return { data: authorizedIds, error: null };
    },
  };
  return { db, rpcCalls };
}

const request = (query: string) => new Request(`https://example.test/fhir/Encounter${query}`, { headers: { authorization: 'Bearer test-token' } });

Deno.test('FHIR search pages have stable IDs and authorize the page in one audited batch', async () => {
  const { db, rpcCalls } = mockDatabase(facilityPatientIds);
  const handler = createFhirHandler(() => db as never, (name) => name === 'SUPABASE_URL' ? 'https://project.test' : 'anon');
  const first = await handler(request(`?patient=${facilityPatientIds[0]}&_count=2`));
  const firstBundle = await first.json();
  assertEquals(first.status, 200);
  assertEquals(firstBundle.entry.map((entry: { resource: { id: string } }) => entry.resource.id), ['b5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000002']);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].name, 'authorize_fhir_read_batch');
  assertEquals(rpcCalls[0].args.p_patient_ids, [facilityPatientIds[0]]);
  const nextUrl = firstBundle.link.find((link: { relation: string }) => link.relation === 'next')?.url;
  assert(nextUrl);
  const second = await handler(new Request(nextUrl, { headers: { authorization: 'Bearer test-token' } }));
  const secondBundle = await second.json();
  assertEquals(secondBundle.entry.map((entry: { resource: { id: string } }) => entry.resource.id), ['b5000000-0000-4000-8000-000000000003']);
  assertEquals(rpcCalls.length, 2);
});

Deno.test('FHIR cross-facility and withheld-consent denials return no bundle resources', async () => {
  for (const denialReason of ['cross-facility', 'withheld-consent']) {
    const { db, rpcCalls } = mockDatabase([], denialReason !== 'cross-facility');
    const handler = createFhirHandler(() => db as never, (name) => name === 'SUPABASE_URL' ? 'https://project.test' : 'anon');
    const response = await handler(request(`?patient=${facilityPatientIds[0]}`));
    assertEquals(response.status, 403, `${denialReason} must deny the resource read`);
    assertEquals((await response.json()).resourceType, 'OperationOutcome');
    assertEquals(rpcCalls.length, 1, `${denialReason} is checked in one batch authorization call`);
    assertEquals(rpcCalls[0].args.p_patient_ids, [facilityPatientIds[0]], `${denialReason} checks the requested patient even if row-level access hid the data`);
  }
});
