import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const OWNER_MARKER = 'onemed-backup-created-by-backup-daily-v1';
const SAFE_CLASSES = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'NetworkError', 'UnknownError']);
process.umask(0o077);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'], ...options });
    let stdout = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.once('error', () => reject(new Error(`command_unavailable_${path.basename(command)}`)));
    child.once('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error(`command_failed_${path.basename(command)}`)));
  });
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function encodePath(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodePath(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

async function emitFailureEvent() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return;
  try {
    await fetch(new URL('/functions/v1/monitoring', url), {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'edge_error', error_class: 'Error', module: 'monitoring', environment: process.env.APP_ENVIRONMENT || 'production' }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Failure reporting must never include backup data, credentials, or exception text.
  }
}

async function backup() {
  const databaseUrl = required('DATABASE_URL');
  const backupRoot = path.resolve(required('BACKUP_DIR'));
  const supabaseUrl = required('SUPABASE_URL');
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const recipient = process.env.BACKUP_ENCRYPTION_RECIPIENT?.trim();
  const allowUnencrypted = process.env.BACKUP_ALLOW_UNENCRYPTED === 'true';
  if (!recipient && !allowUnencrypted) throw new Error('encryption_recipient_required');
  if (!recipient) console.error('WARNING: BACKUP_ALLOW_UNENCRYPTED=true. This backup will be unencrypted. Use only for local development.');
  const database = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.username || !database.password || !database.hostname || !database.pathname.slice(1)) throw new Error('invalid_database_url');

  const root = await realpath(backupRoot).catch(async () => {
    await mkdir(backupRoot, { recursive: true, mode: 0o700 });
    return realpath(backupRoot);
  });
  const retentionDaysText = process.env.BACKUP_RETENTION_DAYS;
  const retentionDays = retentionDaysText === undefined || retentionDaysText === '' ? null : Number(retentionDaysText);
  if (retentionDays !== null && (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650)) throw new Error('invalid_retention_days');

  const s3Endpoint = process.env.BACKUP_S3_ENDPOINT?.trim();
  const s3Bucket = process.env.BACKUP_S3_BUCKET?.trim();
  const s3AccessKey = process.env.BACKUP_S3_ACCESS_KEY_ID?.trim();
  const s3Secret = process.env.BACKUP_S3_SECRET_ACCESS_KEY?.trim();
  const s3Configured = [s3Endpoint, s3Bucket, s3AccessKey, s3Secret].some(Boolean);
  if (s3Configured && ![s3Endpoint, s3Bucket, s3AccessKey, s3Secret].every(Boolean)) throw new Error('incomplete_s3_configuration');
  if (s3Endpoint) {
    const endpoint = new URL(s3Endpoint);
    const localEndpoint = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname);
    if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && localEndpoint)) || endpoint.username || endpoint.password) throw new Error('invalid_s3_endpoint');
  }
  const objectTimeoutMs = Number(process.env.BACKUP_OBJECT_TIMEOUT_MS || '900000');
  if (!Number.isSafeInteger(objectTimeoutMs) || objectTimeoutMs < 1000) throw new Error('invalid_object_timeout');

  const stamp = new Date().toISOString().replaceAll(':', '-');
  const backupName = `medicore-${stamp}-${randomUUID()}`;
  const staging = await mkdtemp(path.join(root, '.medicore-backup-staging-'));
  const bundleDir = path.join(staging, 'bundle');
  const finalDir = path.join(root, backupName);
  const targetExtension = recipient ? 'tar.age' : 'tar';
  const artifactPath = path.join(finalDir, `backup.${targetExtension}`);
  let completed = false;
  let localArtifactVerified = false;

  try {
    await mkdir(bundleDir, { mode: 0o700 });
    const dumpPath = path.join(bundleDir, 'database.dump');
    await run('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', dumpPath], {
      env: {
        PATH: process.env.PATH || '',
        PGHOST: database.hostname,
        PGPORT: database.port || '5432',
        PGDATABASE: decodeURIComponent(database.pathname.slice(1)),
        PGUSER: decodeURIComponent(database.username),
        PGPASSWORD: decodeURIComponent(database.password),
        PGSSLMODE: database.searchParams.get('sslmode') || 'require',
      },
    });

    const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const objectCounts = new Map();
    const listObjects = async (bucket, prefix = '') => {
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw new Error('storage_listing_failed');
        for (const item of data || []) {
          const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.id === null) {
            await listObjects(bucket, objectPath);
            continue;
          }
          const safeParts = objectPath.split('/');
          if (safeParts.some((part) => !part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0')) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(bucket)) throw new Error('unsafe_storage_path');
          const { data: signed, error: signedError } = await client.storage.from(bucket).createSignedUrl(objectPath, 60);
          if (signedError || !signed?.signedUrl) throw new Error('storage_download_failed');
          const objectTarget = path.resolve(bundleDir, 'storage', bucket, ...safeParts);
          if (!objectTarget.startsWith(`${bundleDir}${path.sep}`)) throw new Error('unsafe_storage_target');
          await mkdir(path.dirname(objectTarget), { recursive: true, mode: 0o700 });
          const response = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(objectTimeoutMs) });
          if (!response.ok || !response.body) throw new Error('storage_download_failed');
          await pipeline(response.body, createWriteStream(objectTarget, { mode: 0o600, flags: 'wx' }));
          objectCounts.set(bucket, (objectCounts.get(bucket) || 0) + 1);
        }
        if (!data || data.length < 100) break;
      }
    };

    const { data: buckets, error: bucketError } = await client.storage.listBuckets();
    if (bucketError) throw new Error('storage_bucket_listing_failed');
    for (const bucket of buckets || []) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(bucket.name)) throw new Error('unsafe_storage_bucket');
      await listObjects(bucket.name);
    }

    const payloads = [];
    const collectFiles = async (directory) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const target = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error('unexpected_symlink_in_backup');
        if (entry.isDirectory()) await collectFiles(target);
        else if (entry.isFile()) payloads.push(path.relative(bundleDir, target).split(path.sep).join('/'));
        else throw new Error('unexpected_backup_file_type');
      }
    };
    await collectFiles(bundleDir);
    payloads.sort();
    const checksums = [];
    for (const relative of payloads) checksums.push(`sha256 ${await sha256(path.join(bundleDir, ...relative.split('/')))} ${encodePath(relative)}`);
    const bucketLines = (buckets || []).map((bucket) => `storage_bucket.${bucket.name}.object_count=${objectCounts.get(bucket.name) || 0}`);
    const manifest = [`format=onemed-backup-v1`, `created_at=${new Date().toISOString()}`, `database=database.dump`, ...bucketLines, 'checksums_begin', ...checksums, 'checksums_end', ''].join('\n');
    await writeFile(path.join(bundleDir, 'backup-manifest.txt'), manifest, { mode: 0o600, flag: 'wx' });

    // Check source artifacts immediately before and after packaging/encryption.
    const verifyPayloads = async () => {
      for (const line of checksums) {
        const [, expected, encodedPath] = line.split(' ');
        const relative = decodePath(encodedPath);
        const file = path.resolve(bundleDir, ...relative.split('/'));
        if (!file.startsWith(`${bundleDir}${path.sep}`) || await sha256(file) !== expected) throw new Error('payload_checksum_mismatch');
      }
    };
    await verifyPayloads();
    await mkdir(finalDir, { mode: 0o700 });
    const tarPath = path.join(staging, 'backup.tar');
    await run('tar', ['-cf', tarPath, '-C', bundleDir, '.']);
    await stat(tarPath);
    if (recipient) await run('age', ['--encrypt', '--recipient', recipient, '--output', artifactPath, tarPath]);
    else {
      await copyFile(tarPath, artifactPath);
    }
    await verifyPayloads();
    const artifactHash = await sha256(artifactPath);
    const artifactSize = (await stat(artifactPath)).size;
    if (!artifactSize || await sha256(artifactPath) !== artifactHash) throw new Error('encrypted_artifact_verification_failed');
    await writeFile(path.join(finalDir, 'backup.sha256'), `${artifactHash}  ${path.basename(artifactPath)}\n`, { mode: 0o600, flag: 'wx' });
    await writeFile(path.join(finalDir, '.onemed-backup-owner'), `${OWNER_MARKER}\n${backupName}\n${artifactHash}\n`, { mode: 0o600, flag: 'wx' });
    localArtifactVerified = true;

    if (s3Configured) {
      const key = `${backupName}/${path.basename(artifactPath)}`;
      const region = process.env.BACKUP_S3_REGION?.trim() || 'us-east-1';
      const awsEnv = { ...process.env, AWS_ACCESS_KEY_ID: s3AccessKey, AWS_SECRET_ACCESS_KEY: s3Secret, AWS_DEFAULT_REGION: region, AWS_EC2_METADATA_DISABLED: 'true' };
      await run('aws', ['s3', 'cp', artifactPath, `s3://${s3Bucket}/${key}`, '--endpoint-url', s3Endpoint, '--only-show-errors', '--metadata', `sha256=${artifactHash}`], { env: awsEnv });
      const head = await run('aws', ['s3api', 'head-object', '--bucket', s3Bucket, '--key', key, '--endpoint-url', s3Endpoint, '--output', 'json'], { env: awsEnv });
      let remote;
      try { remote = JSON.parse(head); } catch { throw new Error('s3_verification_failed'); }
      if (remote.ContentLength !== artifactSize || remote.Metadata?.sha256 !== artifactHash) throw new Error('s3_verification_failed');
      const sidecarPath = path.join(finalDir, 'backup.sha256');
      const sidecarHash = await sha256(sidecarPath);
      const sidecarKey = `${backupName}/backup.sha256`;
      await run('aws', ['s3', 'cp', sidecarPath, `s3://${s3Bucket}/${sidecarKey}`, '--endpoint-url', s3Endpoint, '--only-show-errors', '--metadata', `sha256=${sidecarHash}`], { env: awsEnv });
      const sidecarHead = await run('aws', ['s3api', 'head-object', '--bucket', s3Bucket, '--key', sidecarKey, '--endpoint-url', s3Endpoint, '--output', 'json'], { env: awsEnv });
      let remoteSidecar;
      try { remoteSidecar = JSON.parse(sidecarHead); } catch { throw new Error('s3_verification_failed'); }
      if (remoteSidecar.ContentLength !== (await stat(sidecarPath)).size || remoteSidecar.Metadata?.sha256 !== sidecarHash) throw new Error('s3_verification_failed');
    }

    const completedAt = new Date().toISOString();
    const { error: statusError } = await client.from('backup_status').upsert({ singleton: true, last_success_at: completedAt, updated_at: completedAt });
    if (statusError) throw new Error('last_success_update_failed');

    // Retention runs only after encryption, local verification, optional remote verification,
    // and the successful timestamp update have all completed.
    if (retentionDays !== null) {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      for (const name of await readdir(root)) {
        if (name === backupName || !/^medicore-\d{4}-\d\d-\d\dT/.test(name)) continue;
        const candidate = path.join(root, name);
        let info;
        try { info = await lstat(candidate); } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
          throw new Error('retention_scan_failed');
        }
        if (!info.isDirectory() || info.isSymbolicLink() || info.mtimeMs >= cutoff) continue;
        try {
          const ownerLines = (await readFile(path.join(candidate, '.onemed-backup-owner'), 'utf8')).trim().split('\n');
          if (ownerLines[0] !== OWNER_MARKER || ownerLines[1] !== name || !/^[a-f0-9]{64}$/.test(ownerLines[2] || '')) continue;
          const sidecar = (await readFile(path.join(candidate, 'backup.sha256'), 'utf8')).trim().split(/\s+/);
          if (sidecar[0] !== ownerLines[2] || !sidecar[1]?.startsWith('backup.')) continue;
          if (await sha256(path.join(candidate, sidecar[1])) !== ownerLines[2]) continue;
          await rm(candidate, { recursive: true, force: false });
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
          throw new Error('retention_prune_failed');
        }
      }
    }
    completed = true;
    console.log(`Backup verified: ${backupName} (${recipient ? 'age encrypted' : 'UNENCRYPTED LOCAL DEVELOPMENT'})`);
  } finally {
    await rm(staging, { recursive: true, force: true });
    if (!completed && !localArtifactVerified) await rm(finalDir, { recursive: true, force: true });
  }
}

try {
  await backup();
} catch (error) {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const safeClass = SAFE_CLASSES.has(name) ? name : 'UnknownError';
  console.error(`Backup failed (${safeClass}). See the backup runner's protected diagnostics; details are intentionally omitted.`);
  await emitFailureEvent();
  process.exitCode = 1;
}
