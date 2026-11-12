import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../dist');
const types = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('Forbidden');
    try { if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html'); }
    catch { file = resolve(root, 'index.html'); }
    const content = await readFile(file);
    response.writeHead(200, {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https://wlarlseefitzcnfigyib.supabase.co; connect-src 'self' data: https://wlarlseefitzcnfigyib.supabase.co wss://wlarlseefitzcnfigyib.supabase.co https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; upgrade-insecure-requests",
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1');
