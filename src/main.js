import React from 'react';
import * as ReactDOM from 'react-dom/client';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './styles.css';

globalThis.React = React;
globalThis.ReactDOM = ReactDOM;
globalThis.__ONEMED_CAPTCHA_SITE_KEY__ = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

// Keep diagnostics opt-in and text-only in development. Supabase errors can
// include request payloads, so never forward object arguments to the console.
for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
        if (import.meta.env.DEV) {
            const safeText = args.filter((value) => typeof value === 'string');
            if (safeText.length) original(...safeText);
        }
    };
}

const loadLegacyModule = async (path) => {
  const module = await import(path);
  Object.assign(globalThis, module);
};

const { OneMedSupabase } = await import('./supabase.js');
globalThis.OneMedSupabase = OneMedSupabase;
await loadLegacyModule('./js/core.js');
await loadLegacyModule('./js/icons.js');
await loadLegacyModule('./js/ui.js');
await loadLegacyModule('./js/print-documents.js');
await loadLegacyModule('./js/auth.js');
await loadLegacyModule('./js/layout.js');
await loadLegacyModule('./js/modules/dashboard.js');
await loadLegacyModule('./js/modules/patients.js');
await loadLegacyModule('./js/modules/records.js');
await loadLegacyModule('./js/modules/diagnostics.js');
await loadLegacyModule('./js/modules/operations.js');
await loadLegacyModule('./js/modules/admin.js');
await loadLegacyModule('./js/modules/system.js');
await loadLegacyModule('./js/modules/portal.js');
await loadLegacyModule('./js/modules/people.js');
await loadLegacyModule('./js/modules/clinical.js');
await loadLegacyModule('./app.js');
