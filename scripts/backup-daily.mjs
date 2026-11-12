import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const databaseUrl = process.env.DATABASE_URL;
const backupRoot = process.env.BACKUP_DIR;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!databaseUrl || !backupRoot || !supabaseUrl || !serviceKey) throw new Error('DATABASE_URL, BACKUP_DIR, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required.');
const database = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.username || !database.password || !database.hostname || !database.pathname.slice(1)) throw new Error('DATABASE_URL must be a complete PostgreSQL connection URL.');

const timestamp = new Date().toISOString().replaceAll(':', '-');
const destination = path.resolve(backupRoot, `medicore-${timestamp}`);
await mkdir(destination, { recursive: true, mode: 0o700 });
const dumpPath = path.join(destination, 'database.dump');
await new Promise((resolve, reject) => {
    const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', dumpPath], { stdio: 'ignore', env: {
        PATH: process.env.PATH || '',
        PGHOST: database.hostname,
        PGPORT: database.port || '5432',
        PGDATABASE: database.pathname.slice(1),
        PGUSER: decodeURIComponent(database.username),
        PGPASSWORD: decodeURIComponent(database.password),
        PGSSLMODE: database.searchParams.get('sslmode') || 'require'
    } });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`pg_dump exited with status ${code}`)));
});

const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const objectCounts = new Map();
const listObjects = async (bucket, prefix = '') => {
    for (let offset = 0; ; offset += 100) {
        const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw new Error(`Storage backup failed for bucket ${bucket}.`);
        for (const item of data || []) {
            const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.id === null) await listObjects(bucket, objectPath);
            else {
                const safeParts = objectPath.split('/');
                if (safeParts.some((part) => !part || part === '.' || part === '..')) throw new Error('Unsafe object path returned by storage.');
                const { data: blob, error: downloadError } = await client.storage.from(bucket).download(objectPath);
                if (downloadError || !blob) throw new Error(`Storage object backup failed for bucket ${bucket}.`);
                const objectTarget = path.resolve(destination, 'storage', bucket, ...safeParts);
                if (!objectTarget.startsWith(`${path.resolve(destination)}${path.sep}`)) throw new Error('Storage object path escaped backup directory.');
                await mkdir(path.dirname(objectTarget), { recursive: true, mode: 0o700 });
                await writeFile(objectTarget, new Uint8Array(await blob.arrayBuffer()), { mode: 0o600 });
                objectCounts.set(bucket, (objectCounts.get(bucket) || 0) + 1);
            }
        }
        if (!data || data.length < 100) break;
    }
};

const { data: buckets, error: bucketError } = await client.storage.listBuckets();
if (bucketError) throw new Error('Storage bucket enumeration failed.');
for (const bucket of buckets || []) await listObjects(bucket.name);
const bucketManifest = (buckets || []).map((bucket) => `storage_bucket.${bucket.name}.object_count=${objectCounts.get(bucket.name) || 0}`).join('\n');
await writeFile(path.join(destination, 'backup-manifest.txt'), `created_at=${new Date().toISOString()}\ndatabase=database.dump\n${bucketManifest}\n`, { mode: 0o600 });
console.log(`Backup completed: ${path.basename(destination)}`);
