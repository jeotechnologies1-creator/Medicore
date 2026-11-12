import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https://wlarlseefitzcnfigyib.supabase.co; connect-src 'self' https://wlarlseefitzcnfigyib.supabase.co wss://wlarlseefitzcnfigyib.supabase.co https://challenges.cloudflare.com ws://localhost:5173; frame-src https://challenges.cloudflare.com; upgrade-insecure-requests",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

export default defineConfig({
  plugins: [react({ include: /\.[jt]sx?$/ })],
  esbuild: { loader: 'jsx', include: /src\/.*\.js$/ },
  optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
  server: { headers: securityHeaders },
  preview: { headers: securityHeaders },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: ['index.html', 'privacy-notice.html', 'terms.html', 'refund-policy.html']
    }
  }
});
