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
const loadedModules = new Map();

const loadLegacyModule = async (path) => {
  if (loadedModules.has(path)) return loadedModules.get(path);
  const loadModule = legacyModules[path];
  if (!loadModule) throw new Error(`Application module was not included in the build: ${path}`);
  const pending = loadModule().then((module) => {
    Object.assign(globalThis, module);
    return module;
  });
  loadedModules.set(path, pending);
  return pending;
};

const { OneMedSupabase } = await import('./supabase.js');
globalThis.OneMedSupabase = OneMedSupabase;
await Promise.all([
  './js/core.js',
  './js/icons.jsx',
  './js/ui.jsx',
  './js/monitoring.js',
  './js/print-documents.jsx',
  './js/auth.jsx',
  './js/layout.jsx',
  './js/modules/dashboard.jsx',
].map(loadLegacyModule));

const routeModules = {
  patients: ['./js/modules/patients.jsx'],
  records: ['./js/modules/records.jsx'],
  appointments: ['./js/modules/diagnostics.jsx', './js/modules/portal.jsx'],
  doctors: ['./js/modules/people.jsx'],
  consultations: ['./js/modules/clinical.jsx'],
  laboratory: ['./js/modules/diagnostics.jsx'],
  radiology: ['./js/modules/diagnostics.jsx'],
  clinical_workflows: ['./js/modules/clinical.jsx'],
  clinical_decision_support: ['./js/modules/diagnostics.jsx'],
  operations: ['./js/modules/operations.jsx'],
  procurement: ['./js/modules/operations.jsx'],
  referrals: ['./js/modules/operations.jsx'],
  workforce: ['./js/modules/operations.jsx'],
  pharmacy: ['./js/modules/operations.jsx'],
  inventory: ['./js/modules/clinical.jsx'],
  billing: ['./js/modules/operations.jsx', './js/modules/portal.jsx'],
  insurance: ['./js/modules/operations.jsx'],
  payments: ['./js/modules/operations.jsx'],
  documents: ['./js/modules/clinical.jsx'],
  compliance: ['./js/modules/system.jsx'],
  admissions: ['./js/modules/operations.jsx'],
  surgeries: ['./js/modules/operations.jsx'],
  clinical_safety: ['./js/modules/clinical.jsx'],
  reports: ['./js/modules/admin.jsx'],
  audit: ['./js/modules/system.jsx'],
  settings: ['./js/modules/system.jsx'],
  offices: ['./js/modules/people.jsx'],
  organization: ['./js/modules/system.jsx'],
  hr: ['./js/modules/people.jsx'],
  portal: ['./js/modules/portal.jsx'],
  ward: ['./js/modules/operations.jsx'],
  nursing: ['./js/modules/clinical.jsx'],
  vitals: ['./js/modules/clinical.jsx'],
  upload: ['./js/modules/clinical.jsx'],
  medications: ['./js/modules/operations.jsx'],
  results: ['./js/modules/diagnostics.jsx'],
  messages: ['./js/modules/portal.jsx'],
  prescriptions: ['./js/modules/operations.jsx', './js/modules/portal.jsx'],
  lab_results: ['./js/modules/portal.jsx'],
};
const routeAliases = {
  appointment: 'appointments', doctor: 'doctors', lab: 'laboratory', labs: 'laboratory', results: 'laboratory', imaging: 'radiology',
  cds: 'clinical_decision_support', clinical_decision: 'clinical_decision_support', decision_support: 'clinical_decision_support',
  ops: 'operations', command_center: 'operations', procurement_and_supply: 'procurement', supply_chain: 'procurement',
  referral: 'referrals', care_coordination: 'referrals', staffing: 'workforce', workforce_analytics: 'workforce', medications: 'pharmacy',
  finance: 'billing', insurance_claims: 'insurance', claims: 'insurance', payment: 'payments', document_control: 'documents',
  clinical_documents: 'documents', governance: 'compliance', policy_library: 'compliance', admission: 'admissions', ward: 'admissions',
  surgery: 'surgeries', safety: 'clinical_safety', stock: 'inventory', staff: 'hr', human_resources: 'hr', medical_offices: 'offices',
  office: 'offices', report: 'reports', audit_logs: 'audit', system_settings: 'settings', record_management: 'records', medical_records: 'records'
};

globalThis.loadOneMedRouteModule = async (moduleId, role) => {
  const canonicalModuleId = routeAliases[moduleId] || moduleId;
  const paths = [...(routeModules[canonicalModuleId] || [])];
  if (role === 'patient' && ['appointments', 'billing', 'prescriptions'].includes(canonicalModuleId)) {
    paths.push('./js/modules/portal.jsx');
  }
  await Promise.all([...new Set(paths)].map(loadLegacyModule));
};
await loadLegacyModule('./app.js');
