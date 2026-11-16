export const createMockNotificationConnector = (expectedToken: string, status = 202) => {
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.headers.get('authorization') !== `Bearer ${expectedToken}`) return new Response(null, { status: 401 });
    if (!request.headers.get('idempotency-key')) return new Response(null, { status: 400 });
    return new Response(null, { status });
  };
  return { fetcher, requests };
};
