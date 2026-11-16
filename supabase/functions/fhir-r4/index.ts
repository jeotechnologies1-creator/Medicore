import { createClient } from '../_shared/supabase.ts';

const resources = ['Patient', 'Encounter', 'Observation', 'AllergyIntolerance', 'Condition', 'MedicationRequest', 'DiagnosticReport'];
const headers = { 'content-type': 'application/fhir+json; charset=utf-8', 'cache-control': 'no-store' };
const ref = (type: string, id: string) => ({ reference: `${type}/${id}` });
const coding = (system: unknown, code: unknown, display?: unknown) => system && code ? [{ system, code, ...(display ? { display } : {}) }] : undefined;
const cc = (text: unknown, system?: unknown, code?: unknown) => ({ ...(coding(system, code, text) ? { coding: coding(system, code, text) } : {}), ...(text ? { text } : {}) });
const date = (value: unknown) => typeof value === 'string' ? value.slice(0, 10) : undefined;
const quantity = (value: unknown, unit?: string, system?: string, code?: string) => value == null ? undefined : ({ value: Number(value), ...(unit ? { unit } : {}), ...(system ? { system } : {}), ...(code ? { code } : {}) });
export const capabilityStatement = () => ({ resourceType:'CapabilityStatement',status:'active',date:new Date().toISOString(),kind:'instance',fhirVersion:'4.0.1',format:['json'],rest:[{mode:'server',resource:resources.map((name)=>({type:name,interaction:[{code:'read'},{code:'search-type'}],searchParam:[{name:'_id',type:'token'},{name:'patient',type:'reference'}]}))}] });

export function mapResource(type: string, row: Record<string, any>) {
  const base = { resourceType: type, id: row._fhir_id || row.id };
  if (type === 'Patient') return { ...base, identifier: row.patient_number ? [{ value: row.patient_number }] : undefined, active: row.status === 'active', name: [{ family: row.last_name, given: [row.first_name] }], telecom: row.phone ? [{ system: 'phone', value: row.phone }] : undefined, gender: ['male','female','other','unknown'].includes(String(row.gender).toLowerCase()) ? String(row.gender).toLowerCase() : undefined, birthDate: date(row.date_of_birth), address: row.address ? [{ text: row.address }] : undefined };
  if (type === 'Encounter') return { ...base, status: ({ planned:'planned', arrived:'arrived', triaged:'in-progress', in_progress:'in-progress', completed:'finished', cancelled:'cancelled' } as Record<string,string>)[row.status] || 'unknown', class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: ({ emergency:'EMER',inpatient:'IMP',outpatient:'AMB',telehealth:'VR',home_visit:'HH' } as Record<string,string>)[row.encounter_type] || 'AMB' }, subject: ref('Patient', row.patient_id), type: [{ text: row.encounter_type }], period: { start: row.started_at, ...(row.ended_at ? { end: row.ended_at } : {}) }, reasonCode: row.reason_for_visit ? [{ text: row.reason_for_visit }] : undefined, serviceProvider: row.facility_id ? ref('Organization', row.facility_id) : undefined };
  if (type === 'Observation') {
    const isVital = 'recorded_at' in row;
    if (isVital) {
      const map: [string,string,string,string?][] = [['temperature','8310-5','Body temperature','Cel'],['heart_rate','8867-4','Heart rate','/min'],['blood_pressure_systolic','8480-6','Systolic blood pressure','mm[Hg]'],['blood_pressure_diastolic','8462-4','Diastolic blood pressure','mm[Hg]'],['respiratory_rate','9279-1','Respiratory rate','/min'],['oxygen_saturation','2708-6','Oxygen saturation','%'],['weight','29463-7','Body weight','kg'],['height','8302-2','Body height','cm'],['bmi','39156-5','Body mass index','kg/m2']];
      const field = row._fhir_field as string | undefined;
      const [_, code, display, unit] = map.find(([k]) => k === field) || [];
      if (!field) return null;
      const value = { valueQuantity: quantity(row[field], unit, unit ? 'http://unitsofmeasure.org' : undefined, unit) };
      if (field === 'blood_pressure_systolic' || field === 'blood_pressure_diastolic') return { ...base, status: 'final', category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }], code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel' }] }, subject: ref('Patient', row.patient_id), effectiveDateTime: row.recorded_at, component: [['8480-6','Systolic blood pressure',row.blood_pressure_systolic],['8462-4','Diastolic blood pressure',row.blood_pressure_diastolic]].filter((v) => v[2] != null).map(([c,d,v]) => ({ code: { coding: [{ system:'http://loinc.org',code:c,display:d }] }, valueQuantity: quantity(v,'mm[Hg]','http://unitsofmeasure.org','mm[Hg]') })) };
      return { ...base, ...value, status: 'final', category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }], code: { coding: [{ system: 'http://loinc.org', code, display }] }, subject: ref('Patient', row.patient_id), effectiveDateTime: row.recorded_at };
    }
    const result = row.results && typeof row.results === 'object' ? row.results : {};
    const val = result.value ?? result.result;
    if (val == null) return null;
    const status = row.result_status || row.status; const numericValue = typeof val === 'number' ? val : typeof val === 'string' && val.trim() !== '' ? Number(val) : Number.NaN;
    return { ...base, status: ['final','amended','corrected','cancelled','entered-in-error','unknown','preliminary'].includes(status) ? status : 'unknown', category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }], code: cc(result.display || row.test_type, result.code_system || row.code_system, result.code || row.code), subject: ref('Patient', row.patient_id), effectiveDateTime: row.result_date ? `${row.result_date}T00:00:00Z` : row.ordered_date ? `${row.ordered_date}T00:00:00Z` : undefined, valueQuantity: Number.isFinite(numericValue) ? quantity(numericValue, result.unit, result.unit_system, result.unit_code) : undefined, valueString: !Number.isFinite(numericValue) && typeof val === 'string' ? val : undefined, interpretation: result.interpretation ? [{ text: result.interpretation }] : undefined };
  }
  if (type === 'AllergyIntolerance') return { ...base, clinicalStatus: { coding: [{ system:'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',code: (row.clinical_status || 'active').replaceAll('_','-') }] }, verificationStatus: { coding: [{ system:'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',code: (row.verification_status || 'unconfirmed').replaceAll('_','-') }] }, type: 'allergy', category: ['food','environment','medication','biologic'].includes(row.category) ? [row.category] : undefined, criticality: ['low','high'].includes(row.criticality) ? row.criticality : 'unable-to-assess', code: cc(row.substance, row.code_system, row.code), patient: ref('Patient', row.patient_id), onsetDateTime: date(row.onset_date), reaction: row.reaction ? [{ manifestation: [{ text: row.reaction }], ...(row.severity ? { severity: row.severity } : {}) }] : undefined };
  if (type === 'Condition') return { ...base, clinicalStatus: { coding: [{ system:'http://terminology.hl7.org/CodeSystem/condition-clinical',code: (row.clinical_status || 'active').replaceAll('_','-') }] }, verificationStatus: { coding: [{ system:'http://terminology.hl7.org/CodeSystem/condition-ver-status',code: (row.verification_status || 'provisional').replaceAll('_','-') }] }, code: cc(row.condition_name,row.code_system,row.code), subject: ref('Patient',row.patient_id), onsetDateTime: date(row.onset_date), abatementDateTime: date(row.abatement_date) };
  if (type === 'MedicationRequest') { const status=String(row.status||'unknown').replaceAll('_','-'); return { ...base, status: ['active','on-hold','cancelled','completed','entered-in-error','stopped','draft','unknown'].includes(status) ? status : 'unknown', intent: 'order', medicationCodeableConcept: cc(row.medication_name || row.generic_name || 'Medication',row.formulary_system,row.formulary_code), subject: ref('Patient',row.patient_id), authoredOn: row.created_at || row.start_date, dosageInstruction: [{ text: [row.dose,row.dose_unit,row.route,row.frequency].filter(Boolean).join(' ') }], dispenseRequest: { numberOfRepeatsAllowed: row.refills || 0, quantity: quantity(row.dispense_quantity, row.dose_unit) } }; }
  if (type === 'DiagnosticReport') { const status=row.result_status||row.status; return { ...base, status: ['registered','partial','preliminary','final','amended','corrected','appended','cancelled','entered-in-error','unknown'].includes(status) ? status : 'unknown', code: cc(row.test_type || row.study_type,row.code_system,row.code), subject: ref('Patient',row.patient_id), effectiveDateTime: row.result_date ? `${row.result_date}T00:00:00Z` : row.ordered_date ? `${row.ordered_date}T00:00:00Z` : undefined, conclusion: row.report || undefined }; }
  return null;
}

const handler = async (request: Request) => {
  if (request.method !== 'GET') return Response.json({ resourceType:'OperationOutcome', issue:[{severity:'error',code:'not-supported',diagnostics:'Read-only FHIR endpoint'}] }, { status:405,headers });
  const auth = request.headers.get('authorization'); if (!auth?.startsWith('Bearer ')) return Response.json({ error:'Bearer token required' },{status:401,headers});
  const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); if (!url || !anon) return Response.json({error:'FHIR service is not configured'},{status:500,headers});
  const db = createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const { data: { user }, error: authError } = await db.auth.getUser(); if (authError || !user) return Response.json({error:'Invalid bearer token'},{status:401,headers});
  const u = new URL(request.url); const path = u.pathname.replace(/\/$/,'').split('/').filter(Boolean); const at = path.indexOf('fhir');
  const type = path[at + 2]; const id = path[at + 3];
  if (type === 'metadata') return Response.json(capabilityStatement(),{headers});
  if (typeof type!=='string' || !resources.includes(type) || (id && path[at + 3] === '_search')) return Response.json({resourceType:'OperationOutcome',issue:[{severity:'error',code:'not-found'}]},{status:404,headers});
  const table: Record<string,string> = { Patient:'patients',Encounter:'encounters',Observation:'vital_signs',AllergyIntolerance:'patient_allergies',Condition:'patient_conditions',MedicationRequest:'medication_orders',DiagnosticReport:'lab_orders' };
  const patientId=u.searchParams.get('patient')?.replace(/^Patient\//,'');
  if (!id && type==='Patient' && !u.searchParams.get('_id')) return Response.json({resourceType:'OperationOutcome',issue:[{severity:'error',code:'required',diagnostics:'_id is required for Patient reads'}]},{status:400,headers});
  if (!id && type!=='Patient' && !patientId) return Response.json({resourceType:'OperationOutcome',issue:[{severity:'error',code:'required',diagnostics:'patient search parameter is required'}]},{status:400,headers});
  const tables = type==='Observation' ? ['vital_signs','lab_orders'] : type==='DiagnosticReport' ? ['lab_orders','radiology_orders'] : [table[type]];
  const rows: Record<string,any>[]=[];
  const dbId=id && type==='Observation' ? id.match(/^([0-9a-f-]{36})(?:-(?:temperature|heart_rate|blood-pressure|respiratory_rate|oxygen_saturation|weight|height|bmi|\d+))?$/i)?.[1] || id : id;
  for(const tableName of tables){let select='*';if(type==='MedicationRequest')select='*,formulary_items(atc_code,generic_name)';let q=db.from(tableName).select(select); if(id) q=q.eq('id',dbId); else if(type==='Patient') q=q.eq('id',u.searchParams.get('_id')); else q=q.eq('patient_id',patientId).limit(100); const {data,error}=await q; if(error) return Response.json({error:'Resource query denied or unavailable'},{status:403,headers}); rows.push(...((data||[]) as Record<string,any>[]).map((r)=>({...r,_source_table:tableName})));}
  const results=[];
  for(const row of rows){
    const patientId=type==='Patient'?row.id:row.patient_id;
    const {data:authorized,error:authzError}=await db.rpc('authorize_fhir_read',{p_patient_id:patientId,p_resource_type:type});
    if(authzError||authorized!==true) continue;
    let mapped;
    if(type==='Observation'&&'recorded_at' in row){
      const obs=['temperature','heart_rate','respiratory_rate','oxygen_saturation','weight','height','bmi'].filter((field)=>row[field]!=null).map((field)=>mapResource(type,{...row,_fhir_field:field,_fhir_id:`${row.id}-${field}`})).filter(Boolean);
      if(row.blood_pressure_systolic!=null || row.blood_pressure_diastolic!=null) obs.push(mapResource(type,{...row,_fhir_field:'blood_pressure_systolic',_fhir_id:`${row.id}-blood-pressure`}));
      results.push(...obs); continue;
    }
    if(type==='Observation' && row._source_table==='lab_orders') {
      const values=Array.isArray(row.results?.values)?row.results.values:[];
      for(const [i,value] of values.entries()) { const observation=mapResource(type,{...row,results:value,_fhir_id:`${row.id}-${i+1}`}); if(observation)results.push(observation); }
      if(!values.length){const observation=mapResource(type,row);if(observation)results.push(observation);}
      continue;
    }
    if(type==='MedicationRequest'&&row.formulary_items?.atc_code){row.formulary_system='http://www.whocc.no/atc';row.formulary_code=row.formulary_items.atc_code;}
    if(type==='DiagnosticReport') { row.test_type=row.study_type||row.test_type; }
    mapped=mapResource(type,row); if(mapped) results.push(mapped);
  }
  if(id){const resource=results.find((entry)=>entry.id===id); return resource?Response.json(resource,{headers}):Response.json({resourceType:'OperationOutcome',issue:[{severity:'error',code:'not-found'}]},{status:404,headers});}
  return Response.json({resourceType:'Bundle',type:'searchset',total:results.length,entry:results.map((resource)=>({resource,search:{mode:'match'}}))},{headers});
};

if (import.meta.main) Deno.serve(handler);
