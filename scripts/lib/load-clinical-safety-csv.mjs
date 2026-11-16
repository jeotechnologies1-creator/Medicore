import { readFile } from 'node:fs/promises';

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) throw new Error('CSV ends inside a quoted field.');
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const headers = (rows.shift() || []).map((value) => value.trim());
  if (!headers.length || headers.some((value) => !value) || new Set(headers).size !== headers.length) throw new Error('CSV must have unique, non-empty column headers.');
  return rows.filter((cells) => cells.some((cell) => cell.trim())).map((cells) => Object.fromEntries(headers.map((header, column) => [header, (cells[column] || '').trim()])));
}

const requiredSignoff = ['version', 'source', 'licence_note', 'loaded_by', 'clinical_owner_name', 'clinical_owner_profile_id', 'clinical_owner_date'];
export async function runClinicalSafetyCsv(dataset, requiredColumns, argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');
  const positional = argv.filter((arg) => arg !== '--dry-run');
  const [filePath, ...metadataArgs] = positional;
  if (!filePath) throw new Error(`Usage: node scripts/load-${dataset === 'dose_limits' ? 'dose-limits' : dataset}.mjs <file.csv> --key value ... [--dry-run]`);
  const metadata = Object.fromEntries(metadataArgs.map((arg, index) => arg.startsWith('--') ? [arg.slice(2).replaceAll('-', '_'), metadataArgs[index + 1] || ''] : null).filter(Boolean));
  const missingMetadata = requiredSignoff.filter((key) => !metadata[key]);
  if (missingMetadata.length) throw new Error(`Missing sign-off metadata flags: ${missingMetadata.map((key) => `--${key.replaceAll('_', '-')}`).join(', ')}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.clinical_owner_date)) throw new Error('clinical-owner-date must use YYYY-MM-DD.');
  const rows = parseCsv((await readFile(filePath, 'utf8')).replace(/^\uFEFF/, ''));
  if (!rows.length) throw new Error('CSV contains no data rows.');
  const missing = requiredColumns.filter((column) => !Object.hasOwn(rows[0], column));
  if (missing.length) throw new Error(`Missing required CSV columns: ${missing.join(', ')}`);
  const keys = new Set();
  for (const [index, row] of rows.entries()) {
    for (const column of requiredColumns) if (!row[column] && !['atc_code', 'age_min_months', 'age_max_months', 'min_per_dose', 'max_per_dose', 'min_per_day', 'max_per_day', 'renal_note', 'pregnancy_note'].includes(column)) throw new Error(`Row ${index + 2}: ${column} is required.`);
    if (keys.has(row.import_key)) throw new Error(`Duplicate import_key ${row.import_key} in CSV.`);
    keys.add(row.import_key);
    if (dataset === 'interactions' && row.item_a_code === row.item_b_code) throw new Error(`Row ${index + 2}: an interaction must reference two different formulary codes.`);
    if (dataset === 'dose_limits' && !['fixed', 'per_kg'].includes(row.weight_basis || 'fixed')) throw new Error(`Row ${index + 2}: weight_basis must be fixed or per_kg.`);
    for (const column of ['controlled', 'active']) if (column in row && row[column] && !['true', 'false'].includes(row[column].toLowerCase())) throw new Error(`Row ${index + 2}: ${column} must be true or false.`);
  }
  if (dryRun) {
    console.log(JSON.stringify({ dataset, dryRun: true, rowCount: rows.length, uniqueImportKeys: keys.size, signoff: { ...metadata, clinical_owner_profile_id: '[provided]' } }, null, 2));
    return;
  }
  const url = process.env.SUPABASE_URL; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the target project.');
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.rpc('load_clinical_safety_dataset', { p_dataset: dataset, p_rows: rows, p_signoff: metadata });
  if (error) throw new Error(`Atomic import failed; no rows or sign-off were committed: ${error.message}`);
  console.log(`Imported ${data} ${dataset} rows and recorded clinical sign-off in one database transaction.`);
}
