import { readdir, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = path.join(repositoryRoot, 'supabase', 'migrations');
const rollbackDirectory = path.join(repositoryRoot, 'supabase', 'rollback');
const entries = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql'));
const errors = [];
const timestampPattern = /^(\d{14})_[a-z0-9_]+\.sql$/;
const timestamped = [];

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
  if (!/^\s*begin\s*;/im.test(contents)) errors.push(`${name}: missing BEGIN so SET LOCAL timeouts are effective`);
  if (!/^\s*set\s+local\s+lock_timeout\s*=/im.test(contents)) errors.push(`${name}: missing SET LOCAL lock_timeout`);
  if (!/^\s*set\s+local\s+statement_timeout\s*=/im.test(contents)) errors.push(`${name}: missing SET LOCAL statement_timeout`);
  if (!/^\s*commit\s*;/im.test(contents)) errors.push(`${name}: missing COMMIT`);

  try {
    await lstat(path.join(rollbackDirectory, name));
  } catch {
    errors.push(`${name}: missing matching rollback/${name}`);
  }
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
