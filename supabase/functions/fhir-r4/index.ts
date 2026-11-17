import { createClient } from '../_shared/supabase.ts';

export const RESOURCE_TYPES = ['Patient', 'Encounter', 'Observation', 'AllergyIntolerance', 'Condition', 'MedicationRequest', 'DiagnosticReport'] as const;
export type FhirResourceType = typeof RESOURCE_TYPES[number];
type Row = Record<string, unknown>;
type FhirResource = Record<string, unknown> & { resourceType: string; id?: string };
type DbResult = { data: unknown; error: unknown; count?: number | null };
type Query = PromiseLike<DbResult> & {
  select(columns?: string, options?: Record<string, unknown>): Query;
  eq(column: string, value: unknown): Query;
  order(column: string, options?: Record<string, unknown>): Query;
  range(from: number, to: number): Query;
};
type FhirDb = {
  auth: { getUser(): Promise<{ data: { user: unknown | null }; error: unknown }> };
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

const PAGE_SIZE = 200;
export const DEFAULT_COUNT = 50;
export const MAX_COUNT = 100;
export const MAX_OFFSET = 100_000;
export const headers = { 'content-type': 'application/fhir+json; charset=utf-8', 'cache-control': 'no-store' };
const tableFor: Record<FhirResourceType, string[]> = {
  Patient: ['patients'], Encounter: ['encounters'], Observation: ['vital_signs', 'lab_orders'],
  AllergyIntolerance: ['patient_allergies'], Condition: ['patient_conditions'],
  MedicationRequest: ['medication_orders'], DiagnosticReport: ['lab_orders', 'radiology_orders'],
};

const stringValue = (value: unknown): string | undefined => typeof value === 'string' && value.length ? value : undefined;
const numberValue = (value: unknown): number | undefined => value == null || value === '' || !Number.isFinite(Number(value)) ? undefined : Number(value);
const rowString = (row: Row, key: string): string | undefined => stringValue(row[key]);
const rowNumber = (row: Row, key: string): number | undefined => numberValue(row[key]);
const asRecord = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const reference = (type: string, id: unknown) => typeof id === 'string' && id ? { reference: `${type}/${id}` } : undefined;
const datePart = (value: unknown) => typeof value === 'string' ? value.slice(0, 10) : undefined;
const coding = (system: unknown, code: unknown, display?: unknown) => typeof system === 'string' && typeof code === 'string' && system && code
  ? [{ system, code, ...(typeof display === 'string' && display ? { display } : {}) }]
  : undefined;
const codeableConcept = (text: unknown, system?: unknown, code?: unknown): Row => ({
  ...(coding(system, code, text) ? { coding: coding(system, code, text) } : {}),
  ...(typeof text === 'string' && text ? { text } : {}),
});
const quantity = (value: unknown, unit?: unknown, system?: unknown, code?: unknown) => {
  const numeric = numberValue(value);
  if (numeric === undefined) return undefined;
  return { value: numeric, ...(typeof unit === 'string' && unit ? { unit } : {}), ...(typeof system === 'string' && system ? { system } : {}), ...(typeof code === 'string' && code ? { code } : {}) };
};
const baseResource = (type: FhirResourceType, row: Row): FhirResource => ({ resourceType: type, id: rowString(row, '_fhir_id') || rowString(row, 'id') });

export const mapPatient = (row: Row): FhirResource => {
  const given = rowString(row, 'first_name');
  const family = rowString(row, 'last_name');
  const gender = rowString(row, 'gender')?.toLowerCase();
  return {
    ...baseResource('Patient', row),
    ...(rowString(row, 'patient_number') ? { identifier: [{ value: rowString(row, 'patient_number') }] } : {}),
    active: row.status === 'active',
    ...(given || family ? { name: [{ ...(family ? { family } : {}), ...(given ? { given: [given] } : {}) }] } : {}),
    ...(rowString(row, 'phone') ? { telecom: [{ system: 'phone', value: rowString(row, 'phone') }] } : {}),
    ...(gender && ['male', 'female', 'other', 'unknown'].includes(gender) ? { gender } : {}),
    ...(datePart(row.date_of_birth) ? { birthDate: datePart(row.date_of_birth) } : {}),
    ...(rowString(row, 'address') ? { address: [{ text: rowString(row, 'address') }] } : {}),
  };
};

export const mapEncounter = (row: Row): FhirResource => {
  const status: Record<string, string> = { planned: 'planned', arrived: 'arrived', triaged: 'in-progress', in_progress: 'in-progress', completed: 'finished', cancelled: 'cancelled' };
  const encounterClass: Record<string, string> = { emergency: 'EMER', inpatient: 'IMP', outpatient: 'AMB', telehealth: 'VR', home_visit: 'HH' };
  const encounterType = rowString(row, 'encounter_type');
  const start = rowString(row, 'started_at');
  const end = rowString(row, 'ended_at');
  return {
    ...baseResource('Encounter', row), status: status[rowString(row, 'status') || ''] || 'unknown',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: encounterClass[encounterType || ''] || 'AMB' },
    ...(reference('Patient', row.patient_id) ? { subject: reference('Patient', row.patient_id) } : {}),
    ...(encounterType ? { type: [{ text: encounterType }] } : {}),
    ...(start ? { period: { start, ...(end ? { end } : {}) } } : {}),
    ...(rowString(row, 'reason_for_visit') ? { reasonCode: [{ text: rowString(row, 'reason_for_visit') }] } : {}),
    ...(reference('Organization', row.facility_id) ? { serviceProvider: reference('Organization', row.facility_id) } : {}),
  };
};

const observationCategory = (category: string) => [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: category }] }];
const mapVitalObservation = (row: Row): FhirResource | null => {
  const field = rowString(row, '_fhir_field');
  if (!field) return null;
  const vitalMap: Record<string, { code: string; display: string; unit?: string }> = {
    temperature: { code: '8310-5', display: 'Body temperature', unit: 'Cel' },
    heart_rate: { code: '8867-4', display: 'Heart rate', unit: '/min' },
    respiratory_rate: { code: '9279-6', display: 'Respiratory rate', unit: '/min' },
    oxygen_saturation: { code: '2708-6', display: 'Oxygen saturation', unit: '%' },
    weight: { code: '29463-7', display: 'Body weight', unit: 'kg' },
    height: { code: '8302-2', display: 'Body height', unit: 'cm' },
    bmi: { code: '39156-5', display: 'Body mass index', unit: 'kg/m2' },
  };
  const base = baseResource('Observation', row);
  const subject = reference('Patient', row.patient_id);
  const effective = rowString(row, 'recorded_at');
  if (field === 'blood_pressure_systolic') {
    const components = [
      ['8480-6', 'Systolic blood pressure', rowNumber(row, 'blood_pressure_systolic')],
      ['8462-4', 'Diastolic blood pressure', rowNumber(row, 'blood_pressure_diastolic')],
    ].filter((component) => component[2] !== undefined).map(([code, display, value]) => ({
      code: { coding: [{ system: 'http://loinc.org', code, display }] },
      valueQuantity: quantity(value, 'mm[Hg]', 'http://unitsofmeasure.org', 'mm[Hg]'),
    }));
    return {
      ...base, status: 'final', category: observationCategory('vital-signs'),
      code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel' }] },
      ...(subject ? { subject } : {}), ...(effective ? { effectiveDateTime: effective } : {}), component: components,
    };
  }
  const mapped = vitalMap[field];
  if (!mapped) return null;
  return {
    ...base, status: 'final', category: observationCategory('vital-signs'),
    code: { coding: [{ system: 'http://loinc.org', code: mapped.code, display: mapped.display }] },
    ...(subject ? { subject } : {}), ...(effective ? { effectiveDateTime: effective } : {}),
    valueQuantity: quantity(row[field], mapped.unit, mapped.unit ? 'http://unitsofmeasure.org' : undefined, mapped.unit),
  };
};

export const mapObservation = (row: Row): FhirResource | null => {
  if ('recorded_at' in row) return mapVitalObservation(row);
  const result = asRecord(row.results);
  const value = result.value ?? result.result;
  if (value == null) return null;
  const valueText = typeof value === 'string' ? value : undefined;
  const numeric = numberValue(value);
  const status = rowString(row, 'result_status') || rowString(row, 'status') || '';
  const allowedStatus = ['final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown', 'preliminary'];
  const effectiveDate = rowString(row, 'result_date') || rowString(row, 'ordered_date');
  const subject = reference('Patient', row.patient_id);
  return {
    ...baseResource('Observation', row), status: allowedStatus.includes(status) ? status : 'unknown', category: observationCategory('laboratory'),
    code: codeableConcept(result.display || row.test_type, result.code_system || row.code_system, result.code || row.code),
    ...(subject ? { subject } : {}), ...(effectiveDate ? { effectiveDateTime: `${effectiveDate}T00:00:00Z` } : {}),
    ...(numeric !== undefined ? { valueQuantity: quantity(numeric, result.unit, result.unit_system, result.unit_code) } : {}),
    ...(numeric === undefined && valueText !== undefined ? { valueString: valueText } : {}),
    ...(rowString(result, 'interpretation') ? { interpretation: [{ text: rowString(result, 'interpretation') }] } : {}),
  };
};

export const mapAllergyIntolerance = (row: Row): FhirResource => {
  const subject = reference('Patient', row.patient_id);
  const onset = datePart(row.onset_date);
  const category = rowString(row, 'category');
  const criticality = rowString(row, 'criticality');
  const reaction = rowString(row, 'reaction');
  const severity = rowString(row, 'severity');
  return {
    ...baseResource('AllergyIntolerance', row),
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: (rowString(row, 'clinical_status') || 'active').replaceAll('_', '-') }] },
    verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: (rowString(row, 'verification_status') || 'unconfirmed').replaceAll('_', '-') }] },
    type: 'allergy', ...(category && ['food', 'environment', 'medication', 'biologic'].includes(category) ? { category: [category] } : {}),
    criticality: criticality && ['low', 'high'].includes(criticality) ? criticality : 'unable-to-assess',
    code: codeableConcept(row.substance, row.code_system, row.code), ...(subject ? { patient: subject } : {}),
    ...(onset ? { onsetDateTime: onset } : {}),
    ...(reaction ? { reaction: [{ manifestation: [{ text: reaction }], ...(severity ? { severity } : {}) }] } : {}),
  };
};

export const mapCondition = (row: Row): FhirResource => {
  const subject = reference('Patient', row.patient_id);
  const onset = datePart(row.onset_date);
  const abatement = datePart(row.abatement_date);
  return {
    ...baseResource('Condition', row),
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: (rowString(row, 'clinical_status') || 'active').replaceAll('_', '-') }] },
    verificationStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: (rowString(row, 'verification_status') || 'provisional').replaceAll('_', '-') }] },
    code: codeableConcept(row.condition_name, row.code_system, row.code), ...(subject ? { subject } : {}),
    ...(onset ? { onsetDateTime: onset } : {}), ...(abatement ? { abatementDateTime: abatement } : {}),
  };
};

export const mapMedicationRequest = (row: Row): FhirResource => {
  const status = (rowString(row, 'status') || 'unknown').replaceAll('_', '-');
  const allowedStatus = ['active', 'on-hold', 'cancelled', 'completed', 'entered-in-error', 'stopped', 'draft', 'unknown'];
  const subject = reference('Patient', row.patient_id);
  const authoredOn = rowString(row, 'created_at') || rowString(row, 'start_date');
  const dosageText = [rowString(row, 'dose'), rowString(row, 'dose_unit'), rowString(row, 'route'), rowString(row, 'frequency')].filter(Boolean).join(' ');
  const formulary = asRecord(row.formulary_items);
  return {
    ...baseResource('MedicationRequest', row), status: allowedStatus.includes(status) ? status : 'unknown', intent: 'order',
    medicationCodeableConcept: codeableConcept(row.medication_name || row.generic_name || 'Medication', row.formulary_system || (formulary.atc_code ? 'http://www.whocc.no/atc' : undefined), row.formulary_code || formulary.atc_code),
    ...(subject ? { subject } : {}), ...(authoredOn ? { authoredOn } : {}),
    ...(dosageText ? { dosageInstruction: [{ text: dosageText }] } : {}),
    dispenseRequest: { numberOfRepeatsAllowed: rowNumber(row, 'refills') || 0, ...(quantity(row.dispense_quantity, row.dose_unit) ? { quantity: quantity(row.dispense_quantity, row.dose_unit) } : {}) },
  };
};

export const mapDiagnosticReport = (row: Row): FhirResource => {
  const status = rowString(row, 'result_status') || rowString(row, 'status') || '';
  const allowedStatus = ['registered', 'partial', 'preliminary', 'final', 'amended', 'corrected', 'appended', 'cancelled', 'entered-in-error', 'unknown'];
  const effectiveDate = rowString(row, 'result_date') || rowString(row, 'ordered_date');
  const subject = reference('Patient', row.patient_id);
  return {
    ...baseResource('DiagnosticReport', row), status: allowedStatus.includes(status) ? status : 'unknown',
    code: codeableConcept(row.study_type || row.test_type, row.code_system, row.code), ...(subject ? { subject } : {}),
    ...(effectiveDate ? { effectiveDateTime: `${effectiveDate}T00:00:00Z` } : {}),
    ...(rowString(row, 'report') ? { conclusion: rowString(row, 'report') } : {}),
  };
};

const mappers: Record<FhirResourceType, (row: Row) => FhirResource | null> = {
  Patient: mapPatient, Encounter: mapEncounter, Observation: mapObservation, AllergyIntolerance: mapAllergyIntolerance,
  Condition: mapCondition, MedicationRequest: mapMedicationRequest, DiagnosticReport: mapDiagnosticReport,
};

export const mapResource = (type: FhirResourceType, row: Row): FhirResource | null => mappers[type](row);

export const capabilityStatement = (now = new Date()) => ({
  resourceType: 'CapabilityStatement', status: 'active', date: now.toISOString(), kind: 'instance', fhirVersion: '4.0.1', format: ['json'],
  rest: [{ mode: 'server', resource: RESOURCE_TYPES.map((name) => ({
    type: name, interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [{ name: '_id', type: 'token' }, { name: 'patient', type: 'reference' }, { name: '_count', type: 'number' }],
  })) }],
});

export type PageRequest = { count: number; offset: number };
export const parsePageRequest = (url: URL): PageRequest | null => {
  const countText = url.searchParams.get('_count');
  const offsetText = url.searchParams.get('_offset');
  if ((countText !== null && !/^\d+$/.test(countText)) || (offsetText !== null && !/^\d+$/.test(offsetText))) return null;
  const requestedCount = countText === null ? DEFAULT_COUNT : Number(countText);
  const offset = offsetText === null ? 0 : Number(offsetText);
  if (!Number.isSafeInteger(requestedCount) || requestedCount < 1 || !Number.isSafeInteger(offset) || offset < 0 || offset > MAX_OFFSET) return null;
  return { count: Math.min(requestedCount, MAX_COUNT), offset };
};

export const bundleForPage = (resources: FhirResource[], url: URL, page: PageRequest) => {
  const entries = resources.slice(page.offset, page.offset + page.count);
  const hasNext = resources.length > page.offset + page.count;
  const links: { relation: string; url: string }[] = [{ relation: 'self', url: url.toString() }];
  if (hasNext) {
    const nextUrl = new URL(url.toString());
    nextUrl.searchParams.set('_count', String(page.count));
    nextUrl.searchParams.set('_offset', String(page.offset + page.count));
    links.push({ relation: 'next', url: nextUrl.toString() });
  }
  return { resourceType: 'Bundle', type: 'searchset', link: links, entry: entries.map((resource) => ({ resource, search: { mode: 'match' } })) };
};

const outcome = (severity: string, code: string, diagnostics: string) => ({ resourceType: 'OperationOutcome', issue: [{ severity, code, diagnostics }] });
const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const mapRowToResources = (type: FhirResourceType, sourceTable: string, sourceRow: Row): FhirResource[] => {
  const row = { ...sourceRow, _source_table: sourceTable };
  if (type === 'Observation' && sourceTable === 'vital_signs') {
    const fields = ['temperature', 'heart_rate', 'respiratory_rate', 'oxygen_saturation', 'weight', 'height', 'bmi'];
    const observations = fields.filter((field) => row[field] != null).map((field) => mapObservation({ ...row, _fhir_field: field, _fhir_id: `${row.id}-${field}` })).filter((resource): resource is FhirResource => resource !== null);
    if (row.blood_pressure_systolic != null || row.blood_pressure_diastolic != null) {
      const bloodPressure = mapObservation({ ...row, _fhir_field: 'blood_pressure_systolic', _fhir_id: `${row.id}-blood-pressure` });
      if (bloodPressure) observations.push(bloodPressure);
    }
    return observations;
  }
  if (type === 'Observation' && sourceTable === 'lab_orders') {
    const result = asRecord(row.results);
    const values = Array.isArray(result.values) ? result.values : [];
    if (values.length) return values.map((value, index) => mapObservation({ ...row, results: value, _fhir_id: `${row.id}-${index + 1}` })).filter((resource): resource is FhirResource => resource !== null);
  }
  if (type === 'DiagnosticReport' && row.study_type) row.test_type = row.study_type;
  const mapped = mappers[type](row);
  return mapped ? [mapped] : [];
};

const loadResources = async (db: FhirDb, type: FhirResourceType, tables: string[], patientId: string | undefined, recordId: string | undefined, searchId: string | undefined, page: PageRequest): Promise<{ resources: FhirResource[]; error: unknown }> => {
  const resources: FhirResource[] = [];
  for (const tableName of tables) {
    let from = 0;
    while (true) {
      let query = db.from(tableName).select(type === 'MedicationRequest' ? '*,formulary_items(atc_code,generic_name)' : '*').order('id', { ascending: true });
      if (recordId || searchId) query = query.eq('id', recordId || searchId);
      else if (type === 'Patient') query = query.eq('id', patientId);
      else query = query.eq('patient_id', patientId);
      query = query.range(from, from + PAGE_SIZE - 1);
      const { data, error } = await query;
      if (error) return { resources: [], error };
      const rows = Array.isArray(data) ? data as Row[] : [];
      for (const row of rows) resources.push(...mapRowToResources(type, tableName, row));
      if (recordId || searchId || rows.length < PAGE_SIZE || resources.length > page.offset + page.count) break;
      from += PAGE_SIZE;
    }
    if (recordId || searchId || resources.length > page.offset + page.count) break;
  }
  return { resources, error: null };
};

export const createFhirHandler = (
  dbFactory: (url: string, anon: string, options: Record<string, unknown>) => FhirDb = createClient as unknown as (url: string, anon: string, options: Record<string, unknown>) => FhirDb,
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
) => async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') return Response.json(outcome('error', 'not-supported', 'Read-only FHIR endpoint'), { status: 405, headers });
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return Response.json(outcome('error', 'login', 'Bearer token required'), { status: 401, headers });
  const url = getEnv('SUPABASE_URL');
  const anon = getEnv('SUPABASE_ANON_KEY');
  if (!url || !anon) return Response.json({ error: 'FHIR service is not configured' }, { status: 500, headers });
  const db = dbFactory(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return Response.json(outcome('error', 'login', 'Invalid bearer token'), { status: 401, headers });

  const requestUrl = new URL(request.url);
  const segments = requestUrl.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  const fhirIndex = segments.indexOf('fhir');
  const resourceIndex = fhirIndex >= 0 ? fhirIndex + 1 : segments.findIndex((part) => RESOURCE_TYPES.includes(part as FhirResourceType) || part === 'metadata');
  const typeSegment = segments[resourceIndex];
  if (typeSegment === 'metadata') return Response.json(capabilityStatement(), { headers });
  const type = RESOURCE_TYPES.includes(typeSegment as FhirResourceType) ? typeSegment as FhirResourceType : null;
  const recordId = segments[resourceIndex + 1];
  if (!type || recordId === '_search') return Response.json(outcome('error', 'not-found', 'FHIR resource type not found'), { status: 404, headers });
  const page = parsePageRequest(requestUrl);
  if (!page) return Response.json(outcome('error', 'value', `Paging must use positive _count up to ${MAX_COUNT} and _offset no greater than ${MAX_OFFSET}`), { status: 400, headers });
  const patientSearch = requestUrl.searchParams.get('patient')?.replace(/^Patient\//, '');
  const idSearch = requestUrl.searchParams.get('_id');
  const patientSearchId = type === 'Patient' ? undefined : patientSearch;
  if (!recordId && !patientSearchId && !idSearch) return Response.json(outcome('error', 'required', type === 'Patient' ? '_id is required for Patient searches' : 'patient or _id search parameter is required'), { status: 400, headers });
  if ((patientSearchId && !isUuid(patientSearchId)) || (idSearch && !isUuid(idSearch))) return Response.json(outcome('error', 'value', 'FHIR patient and _id searches require a UUID'), { status: 400, headers });
  const dbRecordId = recordId && type === 'Observation' ? recordId.match(/^([0-9a-f-]{36})(?:-(?:temperature|heart_rate|blood-pressure|respiratory_rate|oxygen_saturation|weight|height|bmi|\d+))?$/i)?.[1] || recordId : recordId;
  const dbSearchId = idSearch && type === 'Observation' ? idSearch.match(/^([0-9a-f-]{36})(?:-(?:temperature|heart-rate|blood-pressure|respiratory-rate|oxygen-saturation|weight|height|bmi|\d+))?$/i)?.[1] || idSearch : idSearch;
  const { resources, error } = await loadResources(db, type, tableFor[type], patientSearchId, dbRecordId, dbSearchId, page);
  if (error) return Response.json(outcome('error', 'forbidden', 'Resource query denied or unavailable'), { status: 403, headers });
  const resourcesForAuthorization = recordId ? resources : resources.slice(page.offset, page.offset + page.count);
  const patientIdsFromRows = resourcesForAuthorization.map((resource) => type === 'Patient' ? resource.id : (resource.subject as Row | undefined)?.reference || (resource.patient as Row | undefined)?.reference)
    .filter((value): value is string => typeof value === 'string').map((referenceValue) => referenceValue.split('/').at(-1) || '').filter(isUuid);
  const requestedPatientId = patientSearchId || (type === 'Patient' ? idSearch : undefined);
  const distinctPatientIds = [...new Set([...patientIdsFromRows, ...(requestedPatientId ? [requestedPatientId] : [])])];
  const { data: authorizedData, error: authorizationError } = await db.rpc('authorize_fhir_read_batch', { p_patient_ids: distinctPatientIds, p_resource_type: type });
  if (authorizationError || !Array.isArray(authorizedData)) return Response.json(outcome('error', 'forbidden', 'FHIR access denied by patient, facility, or consent controls'), { status: 403, headers });
  const authorized = new Set(authorizedData.filter(isUuid));
  const authorizedResources = resources.filter((resource) => {
    const referenceValue = type === 'Patient' ? resource.id : (resource.subject as Row | undefined)?.reference || (resource.patient as Row | undefined)?.reference;
    return typeof referenceValue === 'string' && authorized.has(referenceValue.split('/').at(-1) || '');
  });
  if (!authorizedResources.length && distinctPatientIds.length) return Response.json(outcome('error', 'forbidden', 'FHIR access denied by patient, facility, or consent controls'), { status: 403, headers });
  if (recordId) {
    const resource = authorizedResources.find((entry) => entry.id === recordId || entry.id === dbRecordId);
    return resource ? Response.json(resource, { headers }) : Response.json(outcome('error', 'not-found', 'FHIR resource not found'), { status: 404, headers });
  }
  return Response.json(bundleForPage(authorizedResources, requestUrl, page), { headers });
};

const handler = createFhirHandler();
if (import.meta.main) Deno.serve(handler);
