import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import babel from '@babel/core';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
const browserScripts = [
  'src/supabase.js', 'src/js/core.js', 'src/js/icons.js', 'src/js/ui.js', 'src/js/auth.js',
  'src/js/layout.js', 'src/js/modules/dashboard.js', 'src/js/modules/patients.js',
  'src/js/modules/records.js', 'src/js/modules/diagnostics.js', 'src/js/modules/operations.js',
  'src/js/modules/admin.js', 'src/js/modules/system.js', 'src/js/modules/portal.js',
  'src/js/modules/people.js', 'src/js/modules/clinical.js', 'src/app.js'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of browserScripts) {
  const source = await readFile(resolve(root, file), 'utf8');
  const result = await babel.transformAsync(source, {
    filename: file,
    presets: [[ '@babel/preset-react', { runtime: 'classic' } ]],
    sourceType: 'script',
    comments: false
  });
  if (!result?.code) throw new Error(`Babel produced no output for ${file}`);
  const target = resolve(output, file);
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, result.code, 'utf8');
}

let html = await readFile(resolve(root, 'index.html'), 'utf8');
html = html.replace(/\s*<script src="https:\/\/unpkg\.com\/@babel\/standalone@[^\"]+"><\/script>/, '');
html = html.replace(/\s*<script type="text\/babel"/g, '\n    <script');
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  const config = `window.__ONEMED_SUPABASE__ = { url: ${JSON.stringify(process.env.SUPABASE_URL)}, anonKey: ${JSON.stringify(process.env.SUPABASE_ANON_KEY)} };`;
  html = html.replace(/window\.__ONEMED_SUPABASE__\s*=\s*\{[\s\S]*?\};/, config);
  const apiOrigin = new URL(process.env.SUPABASE_URL).origin;
  const realtimeOrigin = apiOrigin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  html = html.replace(/connect-src ([^;]+);/, (_match, existing) => `connect-src ${existing} ${apiOrigin} ${realtimeOrigin};`);
}
await writeFile(resolve(output, 'index.html'), html, 'utf8');
await mkdir(resolve(output, 'src'), { recursive: true });
await cp(resolve(root, 'src/styles.css'), resolve(output, 'src/styles.css'));
await cp(resolve(root, 'refund-policy.html'), resolve(output, 'refund-policy.html'));
console.log(`Built frontend into ${output}`);
