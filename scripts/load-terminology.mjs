#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const [, , system, filePath] = process.argv;
const supportedSystems = new Set(['ICD-10', 'SNOMED CT', 'LOINC', 'ATC']);
if (!system || !filePath || !supportedSystems.has(system)) {
  console.error('Usage: node scripts/load-terminology.mjs <ICD-10|SNOMED CT|LOINC|ATC> <file.csv|file.tsv>');
  process.exit(2);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the target project.');

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (quoted) throw new Error('Input file ends inside a quoted field.');
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

const contents = (await readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
const delimiter = filePath.toLowerCase().endsWith('.tsv') || contents.split('\n', 1)[0].includes('\t') ? '\t' : ',';
const rows = parseDelimited(contents, delimiter);
const headers = (rows.shift() || []).map((value) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
const indexOfAny = (...names) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
const codeIndex = indexOfAny('code', 'conceptcode', 'conceptid', 'loincnum', 'icd10code');
const displayIndex = indexOfAny('display', 'term', 'preferredterm', 'longcommonname', 'shortdescription', 'description', 'name');
const activeIndex = indexOfAny('active', 'isactive', 'status');
const parentIndex = indexOfAny('parentcode', 'parent');
const versionIndex = indexOfAny('version', 'edition', 'releasedate');
const sourceUrlIndex = indexOfAny('sourceurl');
const licenceIndex = indexOfAny('licencenote', 'licence', 'licensenote', 'license');
if (codeIndex < 0 || displayIndex < 0) {
  throw new Error('Expected a delimited official export with code and display columns (aliases such as conceptId/term and LOINC_NUM/LONG_COMMON_NAME are accepted).');
}

const concepts = [];
const codeDisplays = new Map();
let detectedVersion = null;
let detectedSourceUrl = null;
let detectedLicenceNote = null;
for (const cells of rows) {
  const code = (cells[codeIndex] || '').trim();
  const display = (cells[displayIndex] || '').trim();
  if (!code && !display) continue;
  if (!code || !display) throw new Error(`Incomplete code/display record near input row ${concepts.length + 2}.`);
  if (codeDisplays.has(code)) {
    if (codeDisplays.get(code) !== display) throw new Error(`Code ${code} has multiple display terms. Supply a preferred-term export with one row per code.`);
    continue;
  }
  codeDisplays.set(code, display);
  const activeValue = activeIndex < 0 ? 'true' : (cells[activeIndex] || '').trim().toLowerCase();
  let active;
  if (['1', 'true', 'active', 'yes'].includes(activeValue)) active = true;
  else if (['0', 'false', 'inactive', 'no'].includes(activeValue)) active = false;
  else throw new Error(`Unrecognized active value near input row ${concepts.length + 2}: ${activeValue}`);
  const version = versionIndex < 0 ? '' : (cells[versionIndex] || '').trim();
  if (version) {
    if (detectedVersion && detectedVersion !== version) throw new Error('The input contains more than one terminology version.');
    detectedVersion = version;
  }
  const sourceUrl = sourceUrlIndex < 0 ? '' : (cells[sourceUrlIndex] || '').trim();
  if (sourceUrl) {
    if (detectedSourceUrl && detectedSourceUrl !== sourceUrl) throw new Error('The input contains more than one source URL.');
    detectedSourceUrl = sourceUrl;
  }
  const licenceNote = licenceIndex < 0 ? '' : (cells[licenceIndex] || '').trim();
  if (licenceNote) {
    if (detectedLicenceNote && detectedLicenceNote !== licenceNote) throw new Error('The input contains more than one licence note.');
    detectedLicenceNote = licenceNote;
  }
  concepts.push({
    system,
    code,
    display,
    active,
    parent_code: parentIndex < 0 ? null : ((cells[parentIndex] || '').trim() || null)
  });
}
if (!concepts.length) throw new Error('The input contains no terminology concepts.');

const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: systemRow, error: systemError } = await client.from('code_systems').select('code').eq('code', system).maybeSingle();
if (systemError) throw systemError;
if (!systemRow) throw new Error(`Code system ${system} is not registered. Apply the terminology foundation migration first.`);

for (let offset = 0; offset < concepts.length; offset += 500) {
  const { error } = await client.from('concepts').upsert(concepts.slice(offset, offset + 500), { onConflict: 'system,code' });
  if (error) throw new Error(`Import failed at row ${offset + 2}: ${error.message}`);
}
const metadata = { loaded_at: new Date().toISOString() };
if (detectedVersion) metadata.version = detectedVersion;
if (detectedSourceUrl) metadata.source_url = detectedSourceUrl;
if (detectedLicenceNote) metadata.licence_note = detectedLicenceNote;
const { error: updateError } = await client.from('code_systems').update(metadata).eq('code', system);
if (updateError) throw updateError;
console.log(`Imported ${concepts.length} concepts into ${system}${detectedVersion ? ` (${detectedVersion})` : ''}.`);
