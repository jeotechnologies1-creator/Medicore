import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createReadStream } from 'node:fs';

process.umask(0o077);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', ...options });
    child.once('error', () => reject(new Error(`command_unavailable_${path.basename(command)}`)));
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`command_failed_${path.basename(command)}`)));
  });
}

async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function decodePath(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

async function restore() {
  const archive = process.argv[2];
  const databaseUrl = process.env.RESTORE_DATABASE_URL;
  const identityFile = process.env.BACKUP_DECRYPT_IDENTITY_FILE;
  if (!archive || !databaseUrl || (archive.endsWith('.age') && !identityFile)) throw new Error('restore_arguments_required');
  const archivePath = path.resolve(archive);
  const archiveStat = await lstat(archivePath);
  if (!archiveStat.isFile() || archiveStat.isSymbolicLink()) throw new Error('invalid_archive');
  const target = new URL(databaseUrl);
  const databaseName = decodeURIComponent(target.pathname.slice(1)).toLowerCase();
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.username || !target.password || !target.hostname || !databaseName || !/restore|disposable/.test(databaseName) || (!localHost && process.env.RESTORE_ALLOW_NONLOCAL !== 'true')) throw new Error('restore_target_not_disposable');
  const pgEnv = {
    ...process.env,
    PGHOST: target.hostname,
    PGPORT: target.port || '5432',
    PGDATABASE: databaseName,
    PGUSER: decodeURIComponent(target.username),
    PGPASSWORD: decodeURIComponent(target.password),
    PGSSLMODE: target.searchParams.get('sslmode') || (localHost ? 'prefer' : 'require'),
  };
  const sidecar = path.join(path.dirname(archivePath), 'backup.sha256');
  const expectedLine = (await readFile(sidecar, 'utf8')).trim().split(/\s+/);
  if (expectedLine.length < 2 || expectedLine[1] !== path.basename(archivePath) || await checksum(archivePath) !== expectedLine[0]) throw new Error('archive_checksum_failed');

  const temp = await mkdtemp(path.join(os.tmpdir(), 'onemed-restore-'));
  try {
    const tarPath = path.join(temp, 'backup.tar');
    if (archivePath.endsWith('.age')) await run('age', ['--decrypt', '--identity', identityFile, '--output', tarPath, archivePath]);
    else if (archivePath.endsWith('.tar')) await run('cp', [archivePath, tarPath]);
    else throw new Error('unsupported_archive_format');
    const listing = await new Promise((resolve, reject) => {
      const child = spawn('tar', ['-tf', tarPath], { stdio: ['ignore', 'pipe', 'ignore'] });
      let stdout = '';
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.once('error', () => reject(new Error('command_unavailable_tar')));
      child.once('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error('archive_listing_failed')));
    });
    const verboseListing = await new Promise((resolve, reject) => {
      const child = spawn('tar', ['-tvf', tarPath], { stdio: ['ignore', 'pipe', 'ignore'] });
      let stdout = '';
      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.once('error', () => reject(new Error('command_unavailable_tar')));
      child.once('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error('archive_listing_failed')));
    });
    if (String(verboseListing).split('\n').some((entry) => entry[0] === 'l' || entry[0] === 'h')) throw new Error('unsafe_archive_link');
    for (const entry of String(listing).split('\n').filter(Boolean)) {
      const normalized = path.posix.normalize(entry.replace(/^\.\//, ''));
      if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) throw new Error('unsafe_archive_path');
    }
    const bundle = path.join(temp, 'bundle');
    await mkdir(bundle, { mode: 0o700 });
    await run('tar', ['-xf', tarPath, '-C', bundle]);
    const manifest = await readFile(path.join(bundle, 'backup-manifest.txt'), 'utf8');
    if (!manifest.startsWith('format=onemed-backup-v1\n')) throw new Error('invalid_backup_manifest');
    const checksumBlock = manifest.split('checksums_begin\n')[1]?.split('checksums_end')[0];
    if (!checksumBlock) throw new Error('missing_backup_checksums');
    const expectedPaths = new Set();
    for (const line of checksumBlock.split('\n').filter(Boolean)) {
      const [algorithm, expected, encodedPath] = line.split(' ');
      if (algorithm !== 'sha256' || !/^[a-f0-9]{64}$/.test(expected) || !encodedPath) throw new Error('invalid_backup_checksum_entry');
      const relative = decodePath(encodedPath);
      const file = path.resolve(bundle, ...relative.split('/'));
      if (!file.startsWith(`${bundle}${path.sep}`) || expectedPaths.has(relative)) throw new Error('unsafe_backup_manifest_path');
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || await checksum(file) !== expected) throw new Error('backup_payload_checksum_failed');
      expectedPaths.add(relative);
    }
    if (!expectedPaths.has('database.dump')) throw new Error('database_dump_missing');

    await run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', databaseName, path.join(bundle, 'database.dump')], { env: pgEnv });

    const storageRoot = path.join(bundle, 'storage');
    const hasStorage = await lstat(storageRoot).then(() => true).catch(() => false);
    if (hasStorage) {
      const supabaseUrl = process.env.RESTORE_SUPABASE_URL;
      const serviceKey = process.env.RESTORE_SUPABASE_SERVICE_ROLE_KEY;
      const bucketEntries = await readdir(storageRoot, { withFileTypes: true });
      if (bucketEntries.length && (!supabaseUrl || !serviceKey)) throw new Error('storage_restore_credentials_required');
      if (supabaseUrl && serviceKey) {
        const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const uploadDirectory = async (directory, bucket, prefix = '') => {
          for (const item of await readdir(directory, { withFileTypes: true })) {
            const itemPath = path.join(directory, item.name);
            if (item.isSymbolicLink()) throw new Error('unsafe_storage_restore_path');
            const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.isDirectory()) await uploadDirectory(itemPath, bucket, objectPath);
            else if (item.isFile()) {
              const { error } = await client.storage.from(bucket).upload(objectPath, createReadStream(itemPath), { upsert: true });
              if (error) throw new Error('storage_restore_failed');
            } else throw new Error('unsafe_storage_restore_path');
          }
        };
        for (const bucket of bucketEntries) {
          if (!bucket.isDirectory() || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(bucket.name)) throw new Error('unsafe_storage_restore_bucket');
          await uploadDirectory(path.join(storageRoot, bucket.name), bucket.name);
        }
      }
    }

    const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    await run('psql', [databaseName, '-v', 'ON_ERROR_STOP=1', '-f', path.join(repositoryRoot, 'scripts/restore-verify.sql')], { env: pgEnv });
    console.log('Restore and verification completed for the disposable target.');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

try {
  await restore();
} catch (error) {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const allowed = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'NetworkError', 'UnknownError']);
  console.error(`Restore failed (${allowed.has(name) ? name : 'UnknownError'}). Details are intentionally omitted.`);
  process.exitCode = 1;
}
