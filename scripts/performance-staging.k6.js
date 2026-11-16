import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import crypto from 'k6/crypto';

const base = (__ENV.SUPABASE_URL || '').replace(/\/$/, '');
const anon = __ENV.SUPABASE_ANON_KEY || '';
const email = __ENV.PERF_EMAIL || '';
const password = __ENV.PERF_PASSWORD || '';
const patientId = __ENV.PERF_PATIENT_ID || '';
const facilityId = __ENV.PERF_FACILITY_ID || '';
const searchQuery = __ENV.PERF_SEARCH_QUERY || 'LOAD-1';
const testRun = (__ENV.PERF_RUN_ID || `perf-${Date.now()}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
const vus = Number(__ENV.PERF_VUS || 1);
const iterationsPerVu = Number(__ENV.PERF_ITERATIONS_PER_VU || 1);
const names = ['login','patient_search','chart_open','order_entry','dashboard'];
const timing = Object.fromEntries(names.map((name) => [name, new Trend(`${name}_ms`, true)]));
const configuredTargets = Object.fromEntries(names.flatMap((name) => {
  const raw = __ENV[`PERF_TARGET_${name.toUpperCase()}_P95_MS`];
  return raw && Number(raw) > 0 ? [[`${name}_ms`, [`p(95)<${Number(raw)}`]]] : [];
}));

export const options = {
  scenarios: { workflow: { executor: 'per-vu-iterations', vus, iterations: iterationsPerVu } },
  summaryTrendStats: ['avg','min','med','max','p(50)','p(95)','p(99)'],
  thresholds: configuredTargets,
};

function timeRequest(metric, request) {
  const started = Date.now();
  const response = request();
  timing[metric].add(Date.now() - started);
  return response;
}
function headers(token = '') {
  return { apikey: anon, authorization: token ? `Bearer ${token}` : `Bearer ${anon}`, 'content-type': 'application/json' };
}
function base32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0; let value = 0; const bytes = [];
  for (const char of secret.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')) {
    const n = alphabet.indexOf(char); if (n < 0) throw new Error('PERF_TOTP_SECRET must be Base32.');
    value = (value << 5) | n; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(bytes).buffer;
}
function totp(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30); const message = new Uint8Array(8);
  let remaining = counter;
  for (let i = 7; i >= 0; i--) { message[i] = remaining & 255; remaining = Math.floor(remaining / 256); }
  const mac = crypto.hmac('sha1', base32(secret), message.buffer, 'binary');
  const offset = mac[mac.length - 1] & 15;
  const code = ((mac[offset] & 127) << 24) | ((mac[offset + 1] & 255) << 16) | ((mac[offset + 2] & 255) << 8) | (mac[offset + 3] & 255);
  return String(code % 1000000).padStart(6, '0');
}
function requireOk(response, label, expected = (r) => r.status >= 200 && r.status < 300) {
  return check(response, { [`${label} HTTP success`]: expected });
}
function authenticate() {
  const login = timeRequest('login', () => http.post(`${base}/auth/v1/token?grant_type=password`, JSON.stringify({ email, password }), { headers: headers(), tags: { operation: 'login' } }));
  if (!requireOk(login, 'login')) return null;
  let session = login.json();
  // Supabase MFA assurance step for designated staging profiles.
  const token = session.access_token || session.data?.access_token;
  const totpSecret = __ENV.PERF_TOTP_SECRET;
  if (!token) { check(null, { 'password login returns a session': () => false }); return null; }
  if (!totpSecret) return token;
  const factorResponse = http.get(`${base}/auth/v1/factors`, { headers: headers(token), tags: { operation: 'mfa_factors' } });
  if (!requireOk(factorResponse, 'MFA factor lookup')) return null;
  const factors = factorResponse.json(); const factor = (factors.totp || factors.all || []).find((item) => item.status === 'verified' && item.factor_type === 'totp');
  if (!factor) { check(null, { 'verified TOTP factor exists': () => false }); return null; }
  const challenge = http.post(`${base}/auth/v1/factors/${factor.id}/challenge`, '{}', { headers: headers(token), tags: { operation: 'mfa_challenge' } });
  if (!requireOk(challenge, 'MFA challenge')) return null;
  const verify = http.post(`${base}/auth/v1/factors/${factor.id}/verify`, JSON.stringify({ challenge_id: challenge.json('id'), code: totp(totpSecret) }), { headers: headers(token), tags: { operation: 'mfa_verify' } });
  if (!requireOk(verify, 'MFA verify')) return null;
  return verify.json('access_token') || null;
}

export default function () {
  if (!base || !anon || !email || !password || !patientId || !facilityId || !__ENV.PERF_CLINICIAN_ID) throw new Error('Set Supabase URL/key and PERF_EMAIL, PERF_PASSWORD, PERF_PATIENT_ID, PERF_FACILITY_ID, and PERF_CLINICIAN_ID.');
  const token = authenticate(); if (!token) return;
  const authHeaders = headers(token);
  const search = timeRequest('patient_search', () => http.post(`${base}/rest/v1/rpc/search_patient_directory`, JSON.stringify({ p_query: searchQuery, p_offset: 0, p_limit: 50 }), { headers: authHeaders, tags: { operation: 'patient_search' } }));
  if (!requireOk(search, 'patient search')) return;
  check(search.json(), { 'search returns designated synthetic patient': (rows) => Array.isArray(rows) && rows.some((row) => row.id === patientId) });

  const chart = timeRequest('chart_open', () => http.post(`${base}/rest/v1/rpc/read_patient_chart`, JSON.stringify({ p_patient_id: patientId, p_purpose: 'performance_harness' }), { headers: authHeaders, tags: { operation: 'chart_open' } }));
  if (!requireOk(chart, 'chart open')) return;

  const order = {
    patient_id: patientId, doctor_id: __ENV.PERF_CLINICIAN_ID || null,
    responsible_clinician_id: __ENV.PERF_CLINICIAN_ID || null,
    test_type: `PERF_SYNTHETIC_${testRun}_${__VU}_${__ITER}`,
    category: 'Performance harness synthetic', priority: 'routine', status: 'pending',
    ordered_date: new Date().toISOString().slice(0, 10), results: null,
  };
  const orderResponse = timeRequest('order_entry', () => http.post(`${base}/rest/v1/lab_orders`, JSON.stringify(order), { headers: { ...authHeaders, Prefer: 'return=representation' }, tags: { operation: 'order_entry' } }));
  if (!requireOk(orderResponse, 'synthetic order entry')) return;
  check(orderResponse.json(), { 'order entry returns a row': (rows) => Array.isArray(rows) && rows.length === 1 });

  const today = new Date().toISOString().slice(0, 10);
  const dashboard = timeRequest('dashboard', () => http.post(`${base}/rest/v1/rpc/get_screen_kpis`, JSON.stringify({ p_facility_id: facilityId, p_from: today, p_to: today }), { headers: authHeaders, tags: { operation: 'dashboard' } }));
  requireOk(dashboard, 'dashboard KPIs');
}

export function handleSummary(data) {
  const result = { generated_at: new Date().toISOString(), run_id: testRun, staging_host: base, thresholds_configured: configuredTargets, metrics: {} };
  for (const name of names) {
    const values = data.metrics[`${name}_ms`]?.values || {};
    result.metrics[name] = { count: values.count, p50_ms: values['p(50)'] ?? values.med, p95_ms: values['p(95)'], p99_ms: values['p(99)'], avg_ms: values.avg };
  }
  return { [__ENV.PERF_RESULTS_PATH || 'performance-results.json']: JSON.stringify(result, null, 2) };
}
