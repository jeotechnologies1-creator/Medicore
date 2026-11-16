import Ajv from 'npm:ajv@8.17.1';
import { capabilityStatement, mapResource } from '../fhir-r4/index.ts';

Deno.test('FHIR R4 exported core resource shapes validate against HL7 JSON schema', async () => {
  const [schemaResponse, metaResponse] = await Promise.all([
    fetch('https://hl7.org/fhir/R4/fhir.schema.json'),
    fetch('https://json-schema.org/draft-06/schema'),
  ]);
  if (!schemaResponse.ok || !metaResponse.ok) throw new Error('Could not fetch the official HL7 FHIR R4 JSON schema and its draft-06 meta-schema.');
  const schema = await schemaResponse.json(); const meta = await metaResponse.json();
  const ajv = new Ajv({ strict: false, allErrors: true, schemaId: 'auto' });
  ajv.addMetaSchema(meta);
  const validate = ajv.compile(schema);
  const capability = JSON.parse(JSON.stringify(capabilityStatement()));
  if (!validate(capability)) throw new Error(`CapabilityStatement failed HL7 FHIR R4 schema validation: ${JSON.stringify(validate.errors)}`);
  const cases: [string, Record<string, unknown>][] = [
    ['Patient', { id:'p1',patient_number:'MRN-1',first_name:'Synthetic',last_name:'Patient',date_of_birth:'1980-01-02',status:'active',gender:'unknown' }],
    ['Encounter', { id:'e1',patient_id:'p1',status:'completed',encounter_type:'outpatient',started_at:'2026-01-01T10:00:00Z' }],
    ['Observation', { id:'v1',patient_id:'p1',recorded_at:'2026-01-01T10:00:00Z',_fhir_field:'temperature',temperature:36.8 }],
    ['Observation', { id:'v2',patient_id:'p1',recorded_at:'2026-01-01T10:00:00Z',_fhir_field:'blood_pressure_systolic',blood_pressure_systolic:120,blood_pressure_diastolic:80 }],
    ['Observation', { id:'l1',patient_id:'p1',status:'final',test_type:'Synthetic panel',results:{value:4.2,unit:'mmol/L',code_system:'http://loinc.org',code:'2823-3'},result_date:'2026-01-01' }],
    ['AllergyIntolerance', { id:'a1',patient_id:'p1',substance:'Synthetic substance',clinical_status:'active',verification_status:'confirmed',criticality:'low',category:'medication',severity:'mild' }],
    ['Condition', { id:'c1',patient_id:'p1',condition_name:'Synthetic condition',clinical_status:'active',verification_status:'confirmed' }],
    ['MedicationRequest', { id:'m1',patient_id:'p1',status:'active',medication_name:'Synthetic medication',dose:'1',dose_unit:'tablet',route:'oral',frequency:'daily',refills:0 }],
    ['DiagnosticReport', { id:'d1',patient_id:'p1',status:'final',test_type:'Synthetic report',result_date:'2026-01-01' }],
  ];
  for (const [type, row] of cases) {
    const resource = JSON.parse(JSON.stringify(mapResource(type, row)));
    if (!resource || !validate(resource)) throw new Error(`${type} failed HL7 FHIR R4 schema validation: ${JSON.stringify(validate.errors)}`);
  }
});
