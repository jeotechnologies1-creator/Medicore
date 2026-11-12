export const corsHeadersFor = (request: Request, methods = 'POST, OPTIONS'): Record<string, string> | null => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': methods,
    'Vary': 'Origin',
  };
  const origin = request.headers.get('origin');
  if (!origin) return headers;
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  headers['Access-Control-Allow-Origin'] = origin;
  return headers;
};

export const clientAddress = (request: Request): string => {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').map((value) => value.trim()).filter(Boolean);
  return request.headers.get('cf-connecting-ip')?.trim() || request.headers.get('x-real-ip')?.trim() || forwarded?.at(-1) || 'unknown';
};

const sha256 = async (value: string): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((part) => part.toString(16).padStart(2, '0')).join('');

export const checkRateLimit = async (
  client: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  request: Request,
  scope: string,
  userId: string | null,
  maxHits: number,
  windowSeconds = 60,
): Promise<boolean> => {
  const [userKey, ipKey] = await Promise.all([
    userId ? sha256(`${scope}:user:${userId}`) : Promise.resolve(null),
    sha256(`${scope}:ip:${clientAddress(request)}`),
  ]);
  const { data, error } = await client.rpc('consume_edge_rate_limit', {
    p_scope: scope,
    p_user_key: userKey,
    p_ip_key: ipKey,
    p_max_hits: maxHits,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error('Rate limiting service unavailable');
  return data === true;
};

export const recordAccountAudit = async (
  client: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }> },
  actorId: string,
  targetId: string | null,
  targetEmail: string,
  role: string,
  outcome: 'success' | 'failure',
  details: Record<string, unknown> = {},
): Promise<void> => {
  const { error } = await client.rpc('record_account_admin_audit', {
    p_actor_auth_user_id: actorId,
    p_target_auth_user_id: targetId,
    p_target_email: targetEmail,
    p_action: 'account_created',
    p_assigned_role: role,
    p_outcome: outcome,
    p_details: details,
  });
  if (error) throw new Error('Account audit write failed');
};

export const constantTimeEqual = async (left: string, right: string): Promise<boolean> => {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftHash = new Uint8Array(a);
  const rightHash = new Uint8Array(b);
  let mismatch = 0;
  for (let i = 0; i < leftHash.length; i++) mismatch |= leftHash[i] ^ rightHash[i];
  return mismatch === 0;
};

export const verifySignedTimestamp = (value: string | null, nowMs = Date.now()): number | null => {
  if (!value || !/^\d{10}$/.test(value)) return null;
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(nowMs / 1000) - timestamp) > 300) return null;
  return timestamp;
};

export const mapBounded = async <T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
};
