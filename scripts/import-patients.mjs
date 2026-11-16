#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true; else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; } else field += c;
  }
  if (quoted) throw new Error('CSV ends inside a quoted field.');
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const headers = (rows.shift() || []).map((v) => v.trim());
  if (!headers.length || headers.some((v) => !v) || new Set(headers).size !== headers.length) throw new Error('CSV must have unique, non-empty headers.');
  return { headers, rows: rows.filter((cells) => cells.some((v) => v.trim())).map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] || '').trim()]))) };
}
const required = ['source_record_key', 'first_name', 'last_name', 'date_of_birth'];
const optional = ['patient_number', 'gender', 'phone', 'email', 'address', 'blood_group', 'emergency_contact_name', 'emergency_contact_phone', 'allergies', 'chronic_conditions', 'national_id_hash'];
const argv = process.argv.slice(2); const dryRun = argv.includes('--dry-run');
const args = Object.fromEntries(argv.filter((v) => v.startsWith('--')).map((v, i, a) => [v.slice(2).replaceAll('-', '_'), a[i + 1] || '']));
const file = argv.find((v) => !v.startsWith('--'));
if (!file || !args.facility_id || !args.operator_profile_id || !args.source_name) throw new Error('Usage: node scripts/import-patients.mjs <file.csv> --facility-id UUID --operator-profile-id UUID --source-name NAME [--dry-run]');
const { headers, rows } = parseCsv((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const missing = required.filter((v) => !headers.includes(v)); if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`);
if (!rows.length) throw new Error('CSV contains no data rows.');
const seen = new Set(); const errors = [];
for (const [i, row] of rows.entries()) {
  const rowErrors = [];
  for (const col of required) if (!row[col]) rowErrors.push(`${col} is required`);
  if (row.date_of_birth && (!/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth) || Number.isNaN(Date.parse(`${row.date_of_birth}T00:00:00Z`)))) rowErrors.push('date_of_birth must be a valid YYYY-MM-DD date');
  if (row.source_record_key && seen.has(row.source_record_key)) rowErrors.push('source_record_key is repeated in this file');
  seen.add(row.source_record_key);
  if (rowErrors.length) errors.push({ row: i + 2, source_record_key: row.source_record_key || null, errors: rowErrors });
}
if (dryRun) { console.log(JSON.stringify({ dry_run: true, row_count: rows.length, columns: headers, validation_errors: errors }, null, 2)); process.exitCode = errors.length ? 1 : 0; }
else {
  if (errors.length) throw new Error(`CSV has ${errors.length} invalid row(s); run --dry-run and correct them before staging.`);
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the secure operator environment.');
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.rpc('stage_patient_import', { p_facility_id: args.facility_id, p_operator_profile_id: args.operator_profile_id, p_source_name: args.source_name, p_rows: rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => required.includes(k) || optional.includes(k)))) });
  if (error) throw new Error(`Staging failed: ${error.message}`);
  console.log(JSON.stringify({ batch_id: data, staged_rows: rows.length, status: 'staged_for_review' }, null, 2));
}
