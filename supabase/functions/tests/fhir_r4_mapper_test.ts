import { assertEquals, assert } from 'jsr:@std/assert@1';
import {
  mapAllergyIntolerance, mapCondition, mapDiagnosticReport, mapEncounter,
  mapMedicationRequest, mapObservation, mapPatient,
} from '../fhir-r4/index.ts';

Deno.test('mapPatient maps identifiers and demographic fields', () => {
  const patient = mapPatient({ id: 'p1', patient_number: 'MRN-1', first_name: 'Ada', last_name: 'Example', status: 'active', gender: 'female', date_of_birth: '1980-01-02' });
  assertEquals(patient.resourceType, 'Patient');
  assertEquals(patient.identifier, [{ value: 'MRN-1' }]);
  assertEquals(patient.birthDate, '1980-01-02');
});

Deno.test('mapEncounter maps patient reference, class, and period', () => {
  const encounter = mapEncounter({ id: 'e1', patient_id: 'p1', status: 'completed', encounter_type: 'outpatient', started_at: '2026-01-01T10:00:00Z' });
  assertEquals(encounter.resourceType, 'Encounter');
  assertEquals(encounter.status, 'finished');
  assertEquals(encounter.subject, { reference: 'Patient/p1' });
});

Deno.test('mapObservation maps vital and laboratory results', () => {
  const vital = mapObservation({ id: 'v1', recorded_at: '2026-01-01T10:00:00Z', _fhir_field: 'temperature', temperature: 36.8 });
  const lab = mapObservation({ id: 'l1', status: 'final', test_type: 'Panel', results: { value: 4.2, unit: 'mmol/L' } });
  assert(vital && lab);
  assertEquals(vital.resourceType, 'Observation');
  assertEquals(lab.resourceType, 'Observation');
});

Deno.test('mapAllergyIntolerance maps coded allergy status and patient', () => {
  const allergy = mapAllergyIntolerance({ id: 'a1', patient_id: 'p1', substance: 'Latex', clinical_status: 'active', verification_status: 'confirmed' });
  assertEquals(allergy.resourceType, 'AllergyIntolerance');
  assertEquals(allergy.patient, { reference: 'Patient/p1' });
});

Deno.test('mapCondition maps condition status and subject', () => {
  const condition = mapCondition({ id: 'c1', patient_id: 'p1', condition_name: 'Asthma', clinical_status: 'active', verification_status: 'confirmed' });
  assertEquals(condition.resourceType, 'Condition');
  assertEquals(condition.subject, { reference: 'Patient/p1' });
});

Deno.test('mapMedicationRequest maps medication, intent, and subject', () => {
  const medication = mapMedicationRequest({ id: 'm1', patient_id: 'p1', status: 'active', medication_name: 'Medicine', dose: '1', dose_unit: 'tablet' });
  assertEquals(medication.resourceType, 'MedicationRequest');
  assertEquals(medication.intent, 'order');
  assertEquals(medication.subject, { reference: 'Patient/p1' });
});

Deno.test('mapDiagnosticReport maps report status, code, and patient', () => {
  const report = mapDiagnosticReport({ id: 'd1', patient_id: 'p1', status: 'final', test_type: 'Blood count', result_date: '2026-01-01' });
  assertEquals(report.resourceType, 'DiagnosticReport');
  assertEquals(report.status, 'final');
  assertEquals(report.subject, { reference: 'Patient/p1' });
});
