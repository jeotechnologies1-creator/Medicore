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
Object.assign(globalThis, {
    useState: React.useState,
    useEffect: React.useEffect,
    useCallback: React.useCallback,
    useRef: React.useRef,
    useMemo: React.useMemo
});
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

const legacyModules = import.meta.glob(['./app.js', './js/**/*.{js,jsx}']);

const loadLegacyModule = async (path) => {
  const loadModule = legacyModules[path];
  if (!loadModule) throw new Error(`Application module was not included in the build: ${path}`);
  const module = await loadModule();
  Object.assign(globalThis, module);
};

const { OneMedSupabase } = await import('./supabase.js');
globalThis.OneMedSupabase = OneMedSupabase;
await loadLegacyModule('./js/core.js');
await loadLegacyModule('./js/icons.jsx');
await loadLegacyModule('./js/ui.jsx');
await loadLegacyModule('./js/monitoring.js');
await loadLegacyModule('./js/print-documents.jsx');
await loadLegacyModule('./js/auth.jsx');
await loadLegacyModule('./js/layout.jsx');
await loadLegacyModule('./js/modules/dashboard.jsx');
await loadLegacyModule('./js/modules/patients.jsx');
await loadLegacyModule('./js/modules/records.jsx');
await loadLegacyModule('./js/modules/diagnostics.jsx');
await loadLegacyModule('./js/modules/operations.jsx');
await loadLegacyModule('./js/modules/admin.jsx');
await loadLegacyModule('./js/modules/system.jsx');
await loadLegacyModule('./js/modules/portal.jsx');
await loadLegacyModule('./js/modules/people.jsx');
await loadLegacyModule('./js/modules/clinical.jsx');
await loadLegacyModule('./app.js');
