#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportsDir = path.resolve(root, process.env.STAGING_EVIDENCE_DIR || 'artifacts/staging-evidence');
const createdAt = new Date();
const stamp = createdAt.toISOString().replaceAll(':', '-').replaceAll('.', '-');
const reportPath = path.join(reportsDir, `staging-evidence-${stamp}.md`);
const checks = [];

function parseUrl(value, name) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url;
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL with no embedded credentials.`);
  }
}

function normalizedUrl(value, name) {
  const url = parseUrl(value, name);
  return `${url.protocol}//${url.host}`.toLowerCase().replace(/\/$/, '');
}

function csvValues(...keys) {
  return keys.flatMap((key) => (process.env[key] || '').split(',')).map((value) => value.trim()).filter(Boolean);
}

async function runCommand(name, command, args, options = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    });
    const append = (chunk) => {
      output += chunk.toString();
      if (output.length > 1_000_000) output = output.slice(-1_000_000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, options.timeoutMs || 20 * 60 * 1000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      const unavailable = error.code === 'ENOENT';
      resolve({ name, state: unavailable ? 'SKIPPED' : 'FAIL', reason: unavailable ? `Skipped because executable ${command} is unavailable.` : `Could not start ${command}: ${error.message}`, durationMs: Date.now() - started, output: '' });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      const state = code === 0 && !timedOut ? 'PASS' : 'FAIL';
      resolve({
        name,
        state,
        reason: timedOut ? `Timed out after ${(options.timeoutMs || 20 * 60 * 1000) / 60000} minutes.` : code === 0 ? 'Command exited successfully.' : `Command exited ${code ?? signal}.`,
        durationMs: Date.now() - started,
        output
      });
    });
  });
}

function skip(name, reason) {
  checks.push({ name, state: 'SKIPPED', reason, durationMs: 0 });
  console.log(`SKIPPED  ${name}: ${reason}`);
}

function safeReason(text) {
  let result = text;
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'STAGING_SUPABASE_SERVICE_ROLE_KEY', 'STAGING_SUPABASE_ANON_KEY', 'STAGING_DISPOSABLE_DB_URL']) {
    if (process.env[key]) result = result.split(process.env[key]).join('[redacted]');
  }
  return result.replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, '[redacted database URL]').trim();
}

function productionGuard() {
  const stageSupabase = process.env.STAGING_SUPABASE_URL;
  const stageApp = process.env.STAGING_APP_URL;
  const productionSupabase = csvValues('PRODUCTION_SUPABASE_URLS', 'PRODUCTION_SUPABASE_URL');
  const productionApps = csvValues('PRODUCTION_APP_URLS', 'PRODUCTION_APP_URL');
  if (!stageSupabase || !stageApp) return 'Set STAGING_SUPABASE_URL and STAGING_APP_URL to identify the staging targets.';
  if (!productionSupabase.length || !productionApps.length) {
    return 'Refusing to run without both PRODUCTION_SUPABASE_URLS and PRODUCTION_APP_URLS configured as comma-separated production URL deny-lists.';
  }
  let targetSupabase;
  let targetApp;
  let productionSupabaseUrls;
  let productionAppUrls;
  try {
    targetSupabase = normalizedUrl(stageSupabase, 'STAGING_SUPABASE_URL');
    targetApp = normalizedUrl(stageApp, 'STAGING_APP_URL');
    if (new URL(stageSupabase).protocol !== 'https:' || new URL(stageApp).protocol !== 'https:') {
      return 'Refusing non-HTTPS targets; staging Supabase and app URLs must use HTTPS.';
    }
    productionSupabaseUrls = productionSupabase.map((url) => normalizedUrl(url, 'PRODUCTION_SUPABASE_URLS'));
    productionAppUrls = productionApps.map((url) => normalizedUrl(url, 'PRODUCTION_APP_URLS'));
  } catch (error) {
    return error.message;
  }
  if (productionSupabaseUrls.includes(targetSupabase)) return `Refusing to run: staging Supabase target ${targetSupabase} is listed as production.`;
  if (productionAppUrls.includes(targetApp)) return `Refusing to run: staging app target ${targetApp} is listed as production.`;
  const stageHost = new URL(stageSupabase).hostname.toLowerCase();
  const hostRef = stageHost.endsWith('.supabase.co') ? stageHost.split('.')[0] : '';
  const configuredRef = process.env.STAGING_PROJECT_REF || hostRef;
  if (hostRef && configuredRef !== hostRef) return `Refusing to run: STAGING_PROJECT_REF (${configuredRef}) does not match STAGING_SUPABASE_URL project reference (${hostRef}).`;
  if (configuredRef && productionSupabase.some((url) => {
    try { return new URL(url).hostname.toLowerCase().startsWith(`${configuredRef}.`); } catch { return false; }
  })) return `Refusing to run: project reference ${configuredRef} belongs to a Supabase URL listed as production.`;
  return null;
}

async function gitInfo() {
  const commit = await runCommand('commit', 'git', ['rev-parse', 'HEAD'], { timeoutMs: 15000 });
  const status = await runCommand('working tree', 'git', ['status', '--porcelain'], { timeoutMs: 15000 });
  return {
    commit: commit.state === 'PASS' ? commit.output.trim() : 'unavailable',
    dirty: status.state !== 'PASS' ? null : status.output.trim().length > 0,
    dirtyPaths: status.state !== 'PASS' ? [] : status.output.trim().split(/\r?\n/).filter(Boolean).map((line) => line.slice(3))
  };
}

async function localMigrationVersions() {
  const files = await readdir(path.join(root, 'supabase', 'migrations'));
  return files.filter((file) => /^\d{14}_.+\.sql$/.test(file)).map((file) => file.slice(0, 14)).sort();
}

function compareMigrationOutput(output, localVersions) {
  const remoteVersions = [];
  for (const line of output.split(/\r?\n/)) {
    const cells = line.split(/[|│]/).map((cell) => cell.trim());
    if (cells.length < 2) continue;
    const remote = cells[1];
    if (/^\d{14}$/.test(remote)) remoteVersions.push(remote);
  }
  const uniqueRemote = [...new Set(remoteVersions)].sort();
  if (!uniqueRemote.length) return { ok: false, detail: 'Supabase CLI output did not contain parseable remote migration versions.' };
  const missingRemote = localVersions.filter((version) => !uniqueRemote.includes(version));
  const remoteOnly = uniqueRemote.filter((version) => !localVersions.includes(version));
  if (missingRemote.length || remoteOnly.length) {
    return { ok: false, detail: `Local/remote version mismatch. Missing remotely: ${missingRemote.join(', ') || 'none'}. Present only remotely: ${remoteOnly.join(', ') || 'none'}.` };
  }
  return { ok: true, detail: `Remote migration versions match all ${localVersions.length} local timestamped migrations.` };
}

const targetRef = process.env.STAGING_PROJECT_REF || (() => {
  try {
    const hostname = new URL(process.env.STAGING_SUPABASE_URL).hostname;
    return hostname.endsWith('.supabase.co') ? hostname.split('.')[0] : '';
  } catch { return ''; }
})();
const git = await gitInfo();
const guardFailure = productionGuard() || (!/^[0-9a-f]{40,64}$/i.test(git.commit) ? 'Could not determine the exact Git commit; refusing to produce an acceptance run without commit identity.' : null);

async function execute(name, command, args, options) {
  const result = await runCommand(name, command, args, options);
  checks.push({ ...result, reason: result.state === 'PASS' ? result.reason : `${result.reason} ${safeReason(result.output).slice(-1200)}`.trim() });
  console.log(`${result.state.padEnd(8)} ${name}`);
}

if (guardFailure) {
  skip('Staging target safety gate', guardFailure);
  for (const name of ['Lint', 'Static checks', 'Migration check', 'Production build', 'Bundle check', 'Hosted configuration', 'Remote migration comparison', 'pgTAP on disposable database', 'Deno tests', 'Playwright staging journeys']) {
    skip(name, 'Not run because the staging target safety gate refused this invocation.');
  }
} else {
  checks.push({ name: 'Staging target safety gate', state: 'PASS', reason: 'Both target URLs are distinct from the configured production URL deny-lists.', durationMs: 0 });
  console.log('PASS     Staging target safety gate');

  await execute('Lint', 'npm', ['run', 'lint']);
  await execute('Static checks', 'npm', ['test']);
  await execute('Migration check', 'npm', ['run', 'check:migrations']);
  await execute('Production build', 'npm', ['run', 'build']);
  await execute('Bundle check', 'npm', ['run', 'check:bundle-size']);
  if (!process.env.STAGING_SUPABASE_ANON_KEY) {
    skip('Hosted configuration', 'Set STAGING_SUPABASE_ANON_KEY so hosted configuration probes cannot inherit a key for another project.');
  } else {
    await execute('Hosted configuration', 'npm', ['run', 'verify:hosted-config'], {
      env: {
        SUPABASE_URL: process.env.STAGING_SUPABASE_URL,
        VITE_SUPABASE_URL: process.env.STAGING_SUPABASE_URL,
        SUPABASE_ANON_KEY: process.env.STAGING_SUPABASE_ANON_KEY,
        VITE_SUPABASE_ANON_KEY: process.env.STAGING_SUPABASE_ANON_KEY,
        HOSTED_APP_URL: process.env.STAGING_APP_URL
      }, timeoutMs: 90000
    });
  }

  if (!targetRef || !/^[a-z0-9-]+$/i.test(targetRef)) {
    skip('Remote migration comparison', 'Set STAGING_PROJECT_REF or use a Supabase project URL whose hostname begins with the project reference.');
  } else {
    const remote = await runCommand('Supabase remote migration list', 'supabase', ['migration', 'list', `--remote=${targetRef}`], { timeoutMs: 120000 });
    if (remote.state !== 'PASS') {
      checks.push({ name: 'Remote migration comparison', state: 'FAIL', reason: `${remote.reason} ${safeReason(remote.output).slice(-1200)}`.trim(), durationMs: remote.durationMs });
    } else {
      const comparison = compareMigrationOutput(remote.output, await localMigrationVersions());
      checks.push({ name: 'Remote migration comparison', state: comparison.ok ? 'PASS' : 'FAIL', reason: comparison.detail, durationMs: remote.durationMs });
    }
    console.log(`${checks.at(-1).state.padEnd(8)} Remote migration comparison`);
  }

  const disposableDb = process.env.STAGING_DISPOSABLE_DB_URL;
  if (!disposableDb) {
    skip('pgTAP on disposable database', 'Set STAGING_DISPOSABLE_DB_URL to a dedicated disposable test database URL. The staging application database is never used for pgTAP.');
  } else if (!csvValues('PRODUCTION_DATABASE_URLS').length) {
    skip('pgTAP on disposable database', 'Set PRODUCTION_DATABASE_URLS so the disposable connection can be checked against the production database deny-list.');
  } else if (csvValues('PRODUCTION_DATABASE_URLS').some((url) => {
    try {
      const candidate = new URL(url);
      const target = new URL(disposableDb);
      return `${candidate.protocol}//${candidate.host}${candidate.pathname}`.toLowerCase() === `${target.protocol}//${target.host}${target.pathname}`.toLowerCase();
    } catch { return url === disposableDb; }
  })) {
    skip('pgTAP on disposable database', 'Refusing the database URL because it appears in PRODUCTION_DATABASE_URLS.');
  } else {
    await execute('pgTAP on disposable database', 'supabase', ['test', 'db', '--db-url', disposableDb], { timeoutMs: 30 * 60 * 1000 });
  }

  const denoAvailable = await runCommand('Deno availability', 'deno', ['--version'], { timeoutMs: 15000 });
  if (denoAvailable.state !== 'PASS') skip('Deno tests', 'Deno is not installed or could not be started.');
  else await execute('Deno tests', 'npm', ['run', 'test:edge'], { timeoutMs: 15 * 60 * 1000 });

  const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.STAGING_SUPABASE_ANON_KEY;
  const syntheticEmailVars = Object.entries(process.env).filter(([key]) => /^CI_E2E_.*_EMAIL$/.test(key));
  const nonsynthetic = syntheticEmailVars.filter(([, email]) => !/@example\.(test|invalid)$/i.test(email || ''));
  if (!process.env.STAGING_APP_URL || !serviceKey || !anonKey) {
    skip('Playwright staging journeys', 'Set STAGING_APP_URL, STAGING_SUPABASE_ANON_KEY, and STAGING_SUPABASE_SERVICE_ROLE_KEY; the suite global setup requires staging-scoped values.');
  } else if (nonsynthetic.length) {
    skip('Playwright staging journeys', `Refusing non-synthetic CI_E2E email identities: ${nonsynthetic.map(([key]) => key).join(', ')}. Use @example.test or @example.invalid accounts only.`);
  } else {
    await execute('Playwright staging journeys', 'npm', ['run', 'test:e2e'], {
      env: {
        PLAYWRIGHT_BASE_URL: process.env.STAGING_APP_URL,
        SUPABASE_URL: process.env.STAGING_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        SUPABASE_ANON_KEY: anonKey,
        VITE_SUPABASE_URL: process.env.STAGING_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: anonKey
      }, timeoutMs: 45 * 60 * 1000
    });
  }
}

const duration = (ms) => `${(ms / 1000).toFixed(1)}s`;
const rows = checks.map((check) => `| ${check.name} | **${check.state}** | ${check.reason.replaceAll('|', '\\|').replaceAll('\n', ' ')} | ${duration(check.durationMs || 0)} |`).join('\n');
const summary = ['PASS', 'FAIL', 'SKIPPED'].map((state) => `${checks.filter((check) => check.state === state).length} ${state.toLowerCase()}`).join(', ');
const dirtyNote = git.dirty === null ? 'Working tree status unavailable.' : git.dirty ? `Working tree was dirty (${git.dirtyPaths.length} changed/untracked path(s)); checks ran against the working tree shown at run time.` : 'Working tree was clean.';
const displayUrl = (raw, label) => {
  if (!raw) return 'not configured';
  try { return normalizedUrl(raw, label); } catch { return 'invalid URL (see safety gate)'; }
};
const report = `# Staging acceptance evidence\n\n- **Timestamp (UTC):** ${createdAt.toISOString()}\n- **Commit:** \`${git.commit}\`\n- **Working tree:** ${dirtyNote}\n- **Staging Supabase URL:** ${displayUrl(process.env.STAGING_SUPABASE_URL, 'STAGING_SUPABASE_URL')}\n- **Staging app URL:** ${displayUrl(process.env.STAGING_APP_URL, 'STAGING_APP_URL')}\n- **Overall:** ${summary}\n\n| Check | Result | Detail | Duration |\n|---|---|---|---:|\n${rows}\n\nA skipped, unconfigured, or unrunnable check is not a pass. This report records command execution only; review results with the named owners in [staging acceptance](../../docs/deployment/staging-acceptance.md).\n`;

await mkdir(reportsDir, { recursive: true });
await writeFile(reportPath, report, { flag: 'wx' });
console.log(`\nEvidence report: ${path.relative(root, reportPath)}`);
if (checks.some((check) => check.state === 'FAIL' || check.state === 'SKIPPED')) process.exitCode = 1;
