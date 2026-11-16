import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { gzipSync } from 'node:zlib';

const bundleSizeReport = () => ({
  name: 'onemed-bundle-size-report',
  generateBundle(_options, bundle) {
    const chunks = Object.values(bundle)
      .filter((output) => output.type === 'chunk' && output.fileName.endsWith('.js'))
      .map((chunk) => ({
        file: chunk.fileName,
        entry: chunk.isEntry,
        dynamicEntry: chunk.isDynamicEntry,
        rawBytes: Buffer.byteLength(chunk.code),
        gzipBytes: gzipSync(chunk.code).byteLength,
        modules: Object.keys(chunk.modules).map((id) => id.replace(`${process.cwd()}/`, ''))
      }))
      .sort((left, right) => right.gzipBytes - left.gzipBytes);
    const report = {
      generatedAt: new Date().toISOString(),
      totalRawBytes: chunks.reduce((total, chunk) => total + chunk.rawBytes, 0),
      totalGzipBytes: chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0),
      largestChunkGzipBytes: chunks[0]?.gzipBytes || 0,
      chunks
    };
    this.emitFile({
      type: 'asset',
      fileName: 'bundle-size-report.json',
      source: `${JSON.stringify(report, null, 2)}\n`
    });
    console.log(`[bundle-size] ${chunks.length} JS chunks; ${(report.totalGzipBytes / 1024 / 1024).toFixed(2)} MiB gzip total; largest ${(report.largestChunkGzipBytes / 1024).toFixed(1)} KiB gzip.`);
  }
});

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https://wlarlseefitzcnfigyib.supabase.co; connect-src 'self' data: https://wlarlseefitzcnfigyib.supabase.co wss://wlarlseefitzcnfigyib.supabase.co https://challenges.cloudflare.com ws://localhost:5173; frame-src https://challenges.cloudflare.com; upgrade-insecure-requests",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

export default defineConfig({
  plugins: [react({ include: /\.[jt]sx?$/ }), bundleSizeReport()],
  esbuild: { loader: 'jsx', include: /src\/.*\.(js|jsx)$/, exclude: [] },
  optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
  server: { headers: securityHeaders },
  preview: { headers: securityHeaders },
  build: {
    target: 'esnext',
    manifest: true,
    rollupOptions: {
      input: ['index.html', 'privacy-notice.html', 'terms.html', 'refund-policy.html']
    }
  }
});
