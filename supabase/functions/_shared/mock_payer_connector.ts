/** In-memory, deterministic connector used only by Deno tests. */
export function createMockPayerConnector() {
  const seen = new Map<string, Record<string, unknown>>();
  return {
    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const request = new Request(input, init);
      const key = request.headers.get('idempotency-key');
      if (!key) return Response.json({ error: 'idempotency-key required' }, { status: 400 });
      if (seen.has(key)) return Response.json(seen.get(key));
      const payload = await request.json() as Record<string, unknown>;
      const path = new URL(request.url).pathname;
      let result: Record<string, unknown>;
      if (path.endsWith('/eligibility')) result = { status: 'eligible', reference: `mock-${key}`, expires_at: new Date(Date.now() + 3600_000).toISOString() };
      else if (path.endsWith('/preauthorizations')) result = { status: 'approved', external_reference: `mock-${key}` };
      else if (path.endsWith('/claims')) result = { status: 'accepted', external_claim_id: `mock-${key}` };
      else return Response.json({ error: 'unsupported mock route', received: payload }, { status: 404 });
      seen.set(key, result);
      return Response.json(result);
    },
    get requestCount() { return seen.size; },
  };
}
