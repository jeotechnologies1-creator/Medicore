#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const checks = [];
const report = (name, state, detail) => checks.push({ name, state, detail });
const normalizeUrl = (raw, label) => {
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url;
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL without embedded credentials.`);
  }
};

const timeoutSignal = () => AbortSignal.timeout(10000);
const responseBody = async (response) => {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { message: text }; }
};
const errorText = (body) => `${body?.error_code ?? ''} ${body?.code ?? ''} ${body?.msg ?? ''} ${body?.message ?? ''}`.toLowerCase();

const authUrlRaw = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const frontendUrlRaw = process.env.HOSTED_APP_URL || process.env.FRONTEND_URL;
let authUrl;
let frontendUrl;
if (!authUrlRaw || !anonKey) {
  report('Auth public endpoint configuration', 'UNVERIFIABLE', 'Set SUPABASE_URL and SUPABASE_ANON_KEY (or their VITE_ equivalents); no secret key is needed.');
} else {
  try { authUrl = normalizeUrl(authUrlRaw, 'SUPABASE_URL'); }
  catch (error) { report('Auth public endpoint configuration', 'FAIL', error.message); }
}
if (!frontendUrlRaw) {
  report('Front-end security headers', 'UNVERIFIABLE', 'Set HOSTED_APP_URL to the deployed front-end origin.');
} else {
  try { frontendUrl = normalizeUrl(frontendUrlRaw, 'HOSTED_APP_URL'); }
  catch (error) { report('Front-end security headers', 'FAIL', error.message); }
}

if (authUrl && anonKey) {
  const headers = { apikey: anonKey, 'content-type': 'application/json' };
  try {
    const response = await fetch(new URL('/auth/v1/token?grant_type=password', authUrl), {
      method: 'POST', headers, signal: timeoutSignal(),
      body: JSON.stringify({ email: 'hosted-config-check@example.invalid', password: 'NoRealAccount-OnlyProbe-9!' }),
    });
    const body = await responseBody(response);
    const error = errorText(body);
    if (response.status === 429) report('CAPTCHA required on sign-in', 'UNVERIFIABLE', 'Auth rate-limited the synthetic probe; retry later.');
    else if (/captcha.*(required|missing|verification)|captcha_required|captcha_token_required/.test(error)) {
      report('CAPTCHA required on sign-in', 'PASS', 'The public password sign-in endpoint rejects a request without a CAPTCHA token.');
    } else {
      report('CAPTCHA required on sign-in', 'FAIL', `A request without a CAPTCHA token was not rejected as CAPTCHA-required (HTTP ${response.status}).`);
    }
  } catch {
    report('CAPTCHA required on sign-in', 'UNVERIFIABLE', 'The public Auth endpoint could not be reached.');
  }

  try {
    const response = await fetch(new URL('/auth/v1/signup', authUrl), {
      method: 'POST', headers, signal: timeoutSignal(),
      body: JSON.stringify({ email: `hosted-config-check-${Date.now()}@example.invalid`, password: 'NoRealAccount-OnlyProbe-9!' }),
    });
    const body = await responseBody(response);
    const error = errorText(body);
    if (/signup.*(disabled|not allowed)|signups not allowed|signup_disabled/.test(error)) {
      report('Signup disabled', 'PASS', 'The public Auth signup endpoint rejects account creation because signup is disabled.');
    } else if (/captcha.*(required|missing|verification)|captcha_required|captcha_token_required/.test(error)) {
      report('Signup disabled', 'UNVERIFIABLE', 'CAPTCHA rejected the synthetic signup probe before the endpoint exposed its signup policy.');
    } else if (response.status === 429) {
      report('Signup disabled', 'UNVERIFIABLE', 'Auth rate-limited the synthetic probe; retry later.');
    } else {
      report('Signup disabled', 'FAIL', `The endpoint did not confirm signup is disabled (HTTP ${response.status}).`);
    }
  } catch {
    report('Signup disabled', 'UNVERIFIABLE', 'The public Auth endpoint could not be reached.');
  }
} else {
  report('CAPTCHA required on sign-in', 'UNVERIFIABLE', 'The public Auth URL and anon key are required for this check.');
  report('Signup disabled', 'UNVERIFIABLE', 'The public Auth URL and anon key are required for this check.');
}

const sourcePath = fileURLToPath(new URL('../public/_headers', import.meta.url));
let expectedHeaders = [];
try {
  const source = await readFile(sourcePath, 'utf8');
  let inWildcardBlock = false;
  for (const line of source.split(/\r?\n/)) {
    if (line && !/^\s/.test(line)) inWildcardBlock = line.trim() === '/*';
    else if (inWildcardBlock) {
      const match = line.match(/^\s+([^:]+):\s*(.*?)\s*$/);
      if (match) expectedHeaders.push([match[1].toLowerCase(), match[2]]);
    }
  }
  if (!expectedHeaders.length) throw new Error('No headers found under the /* rule in public/_headers.');
} catch (error) {
  report('Front-end security headers', 'FAIL', `Could not read public/_headers: ${error.message}`);
}

if (frontendUrl && expectedHeaders.length) {
  try {
    const response = await fetch(frontendUrl, { method: 'GET', redirect: 'follow', signal: timeoutSignal() });
    if (!response.ok) {
      report('Front-end security headers', 'FAIL', `Front-end returned HTTP ${response.status}.`);
      await response.body?.cancel();
    } else {
      for (const [name, expected] of expectedHeaders) {
        const actual = response.headers.get(name);
        const label = name === 'content-security-policy' ? 'Content-Security-Policy present and matches public/_headers' : `${name} matches public/_headers`;
        if (actual === expected) report(label, 'PASS', 'Served value matches the repository header policy.');
        else if (actual === null) report(label, 'FAIL', 'Header is absent from the hosted front-end response.');
        else report(label, 'FAIL', 'Served value differs from public/_headers.');
      }
      await response.body?.cancel();
    }
  } catch {
    report('Front-end security headers', 'UNVERIFIABLE', 'The hosted front-end could not be reached.');
  }
} else if (expectedHeaders.length) {
  report('Front-end security headers', 'UNVERIFIABLE', 'Set HOSTED_APP_URL to the deployed front-end origin.');
}

for (const name of [
  'Hosted CAPTCHA provider is Cloudflare Turnstile and its server-side secret matches the frontend site key',
  'Password minimum is 12 characters with lowercase, uppercase, digits, and symbols',
  'MFA: TOTP enrollment and verification enabled; app requires AAL2 for super_admin, accountant, doctor, pharmacist, surgeon, and specialist',
  'Auth session timebox is 12 hours and Auth inactivity timeout is 2 hours',
  'site_url and additional redirect URLs exactly match the deployed app and used callbacks',
  'Custom SMTP is enabled with facility sender/domain and appropriate delivery limits',
  'JWT expiry is 3600 seconds (1 hour)',
]) report(name, 'UNVERIFIABLE', 'Requires review in the hosted Supabase dashboard or authenticated project configuration; this script uses public endpoints only.');

for (const check of checks) console.log(`${check.state.padEnd(13)} ${check.name}\n              ${check.detail}`);
const failed = checks.some((check) => check.state === 'FAIL');
const unverifiable = checks.some((check) => check.state === 'UNVERIFIABLE');
console.log(`\n${checks.filter((check) => check.state === 'PASS').length} passed, ${checks.filter((check) => check.state === 'FAIL').length} failed, ${checks.filter((check) => check.state === 'UNVERIFIABLE').length} unverifiable.`);
if (failed || unverifiable) process.exitCode = 1;
