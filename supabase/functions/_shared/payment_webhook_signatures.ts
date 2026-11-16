import { constantTimeEqual } from './security.ts';

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
const hmac = async (secret: string, algorithm: 'SHA-256' | 'SHA-512', content: Uint8Array) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, content);
};

export async function verifyPaystackSignature(rawBody: string, headers: Headers, apiSecret: string | undefined, signingSecrets: string[], nowSeconds = Math.floor(Date.now() / 1000)) {
  const modern = headers.get('paystack-signature');
  if (modern) {
    const parts = modern.split(',').map((part) => part.trim());
    const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
    const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3).split(':', 2)[1]).filter((part): part is string => !!part);
    if (!timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > 300 || !signatures.length) return false;
    for (const secret of signingSecrets.filter(Boolean)) {
      const expected = hex(await hmac(secret, 'SHA-512', new TextEncoder().encode(`${timestamp}.${rawBody}`)));
      for (const signature of signatures) if (await constantTimeEqual(signature.toLowerCase(), expected)) return true;
    }
  }
  const legacy = headers.get('x-paystack-signature');
  if (legacy && apiSecret) {
    const expected = hex(await hmac(apiSecret, 'SHA-512', new TextEncoder().encode(rawBody)));
    if (await constantTimeEqual(legacy.toLowerCase(), expected)) return true;
  }
  return false;
}

export async function verifyFlutterwaveSignature(rawBody: string, headers: Headers, secretHash: string | undefined, scheme: string | undefined) {
  if (!secretHash) return false;
  if ((scheme ?? 'v3') === 'v3') return constantTimeEqual(headers.get('verif-hash') ?? '', secretHash);
  if (scheme === 'hmac-sha256-base64') {
    const signature = headers.get('flutterwave-signature') ?? '';
    const encoded = btoa(String.fromCharCode(...new Uint8Array(await hmac(secretHash, 'SHA-256', new TextEncoder().encode(rawBody)))));
    return constantTimeEqual(signature, encoded);
  }
  return false;
}
