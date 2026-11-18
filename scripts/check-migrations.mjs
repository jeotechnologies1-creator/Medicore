import { readdir, lstat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = path.join(repositoryRoot, 'supabase', 'migrations');
const rollbackDirectory = path.join(repositoryRoot, 'supabase', 'rollback');
const testDirectory = path.join(repositoryRoot, 'supabase', 'tests');
const exceptionPath = path.join(testDirectory, 'migration-test-exceptions.json');
const lockPath = path.join(repositoryRoot, 'supabase', 'migrations.lock');
const entries = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql'));
const errors = [];
const timestampPattern = /^(\d{14})_[a-z0-9_]+\.sql$/;
const timestamped = [];
const exceptions = JSON.parse(await readFile(exceptionPath, 'utf8'));
let migrationLock;
try {
  migrationLock = JSON.parse(await readFile(lockPath, 'utf8'));
} catch (error) {
  errors.push(`supabase/migrations.lock: unable to read valid lock file (${error.message})`);
  migrationLock = { version: 1, migrations: {}, unlocks: [] };
}
if (migrationLock.version !== 1 || !migrationLock.migrations || typeof migrationLock.migrations !== 'object' || !Array.isArray(migrationLock.unlocks)) {
  errors.push('supabase/migrations.lock: expected version 1, a migrations hash map, and an unlocks array');
  migrationLock = { version: 1, migrations: {}, unlocks: [] };
}
const unlockByMigration = new Map();
for (const unlock of migrationLock.unlocks) {
  const valid = unlock && typeof unlock.migration === 'string'
    && typeof unlock.reason === 'string' && unlock.reason.trim().length >= 20
    && unlock.never_applied_to_shared_environment === true;
  if (!valid) errors.push('supabase/migrations.lock: every unlock needs a migration, a 20-character reason, and never_applied_to_shared_environment=true');
  else if (unlockByMigration.has(unlock.migration)) errors.push(`${unlock.migration}: duplicate migration unlock entry`);
  else unlockByMigration.set(unlock.migration, unlock);
}
const exceptionByMigration = new Map(exceptions.map((entry) => [entry.migration, entry.reason]));
const testFiles = new Set((await readdir(testDirectory)).filter((name) => name.endsWith('.test.sql')));
const hasMatchingTest = (migrationName) => {
  const exact = `${migrationName.slice(0, -4)}.test.sql`;
  const feature = migrationName.replace(/^\d{14}_/, '').replace(/\.sql$/, '');
  return testFiles.has(exact) || [...testFiles].some((file) => {
    const testFeature = file.replace(/^\d{14}_/, '').replace(/\.test\.sql$/, '');
    return testFeature === feature || testFeature.startsWith(`${feature}_`);
  });
};

for (const entry of exceptions) {
  if (!entry.migration || !entry.reason || entry.reason.trim().length < 20) {
    errors.push(`Invalid test coverage exception: each entry needs a migration and a reason of at least 20 characters`);
  }
}

for (const name of entries) {
  const migrationPath = path.join(migrationDirectory, name);
  const stat = await lstat(migrationPath);
  if (stat.isSymbolicLink()) errors.push(`${name}: migration must be a real file, not a symlink`);
  if (!stat.isFile() && !stat.isSymbolicLink()) errors.push(`${name}: migration is not a regular file`);

  const match = name.match(timestampPattern);
  if (!match) {
    errors.push(`${name}: expected YYYYMMDDHHMMSS_description.sql`);
    continue;
  }
  timestamped.push({ name, timestamp: match[1] });

  const contents = await readFile(migrationPath, 'utf8');
  const actualHash = createHash('sha256').update(contents).digest('hex');
  const lockedHash = migrationLock.migrations[name];
  const unlock = unlockByMigration.get(name);
  if (typeof lockedHash !== 'string') errors.push(`${name}: missing SHA-256 entry in supabase/migrations.lock`);
  else if (lockedHash !== actualHash) {
    if (!unlock) errors.push(`${name}: SHA-256 differs from supabase/migrations.lock; use a documented never-applied unlock or add a forward migration`);
    else console.warn(`${name}: hash change permitted by explicit never-applied unlock: ${unlock.reason}`);
  } else if (unlock) errors.push(`${name}: stale unlock entry; remove it after updating the migration lock`);
  if (!/^\s*begin\s*;/im.test(contents)) errors.push(`${name}: missing BEGIN so SET LOCAL timeouts are effective`);
  if (!/^\s*set\s+local\s+lock_timeout\s*=/im.test(contents)) errors.push(`${name}: missing SET LOCAL lock_timeout`);
  if (!/^\s*set\s+local\s+statement_timeout\s*=/im.test(contents)) errors.push(`${name}: missing SET LOCAL statement_timeout`);
  if (!/^\s*commit\s*;/im.test(contents)) errors.push(`${name}: missing COMMIT`);

  try {
    await lstat(path.join(rollbackDirectory, name));
  } catch {
    errors.push(`${name}: missing matching rollback/${name}`);
  }

  if (!hasMatchingTest(name) && !exceptionByMigration.has(name)) {
    errors.push(`${name}: missing corresponding migration or feature test and no justified exception is recorded`);
  }
}

for (const name of Object.keys(migrationLock.migrations)) {
  if (!entries.includes(name)) errors.push(`${name}: stale migration hash entry in supabase/migrations.lock`);
}
for (const name of unlockByMigration.keys()) {
  if (!entries.includes(name)) errors.push(`${name}: stale migration unlock entry`);
}

for (const exception of exceptions) {
  if (!entries.includes(exception.migration)) errors.push(`${exception.migration}: stale migration test exception`);
  if (hasMatchingTest(exception.migration)) errors.push(`${exception.migration}: remove exception because a matching test now exists`);
}

const chronological = [...timestamped].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
for (let index = 1; index < chronological.length; index++) {
  if (chronological[index - 1].timestamp >= chronological[index].timestamp) {
    errors.push(`${chronological[index].name}: timestamp is duplicated or out of order`);
  }
}
for (let index = 1; index < timestamped.length; index++) {
  if (timestamped[index - 1].timestamp >= timestamped[index].timestamp) {
    errors.push(`${timestamped[index].name}: migrations directory is not in strictly increasing timestamp order`);
  }
}
if (timestamped.length !== chronological.length) errors.push('One or more migration names do not include a timestamp.');

if (errors.length) {
  console.error(`Migration checks failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Migration checks passed (${timestamped.length} timestamp-ordered migrations).`);
}
