        const ConsultationsModule = () => {
            const { user } = useAuth();
            const [consultations, setConsultations] = useState(getLiveStore().consultations || []);
            const [form, setForm] = useState({ patientId: '', doctorId: '', chiefComplaint: '', diagnosis: '', diagnosisCodeSystem: null, diagnosisCode: null, diagnosisDisplay: null, assessment: '', plan: '', followUpDate: '' });
            const [consultationMessage, setConsultationMessage] = useState('');
            const [prescriptionForm, setPrescriptionForm] = useState({ patientId: '', diagnosis: '', diagnosisCodeSystem: null, diagnosisCode: null, diagnosisDisplay: null, formularyItemId: '', quantity: 1, dose: '', doseUnit: '', route: '', frequency: '', duration: '', instructions: '', priority: 'routine' });
            const [prescriptionMessage, setPrescriptionMessage] = useState('');
            const [formulary, setFormulary] = useState([]);

            useEffect(() => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return;
                client.from('formulary_items').select('id,atc_code,generic_name,form,strength,unit,route,controlled').eq('active', true).order('generic_name')
                    .then(({ data, error }) => { if (!error && data) setFormulary(data); });
            }, []);

            const handleSaveConsultation = async () => {
                if (!form.patientId || !form.chiefComplaint.trim() || !form.diagnosis.trim() || !form.assessment.trim() || !form.plan.trim()) return setConsultationMessage('Patient, presenting complaint, diagnosis, assessment, and plan are required before finalizing.');
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return setConsultationMessage('The clinical database is unavailable. No consultation was saved.');
                const encounter = (appData.encounters || []).find((item) => item.patientId === form.patientId && !item.endedAt);
                const { data, error } = await client.from('consultations').insert({
                    patient_id: form.patientId, encounter_id: encounter?.id || null, doctor_id: form.doctorId || user?.id || null, chief_complaint: form.chiefComplaint,
                    diagnosis: form.diagnosis || null, code_system: form.diagnosisCodeSystem, code: form.diagnosisCode, display: form.diagnosisDisplay, assessment: form.assessment || null, plan: form.plan || null,
                    follow_up_date: form.followUpDate || null, status: 'completed'
                }).select();
                if (error || !data?.[0]) return setConsultationMessage(error?.message || 'Consultation was not saved.');
                const next = [normalizeConsultations(data)[0], ...consultations];
                appData.consultations = next;
                setConsultations(next);
                setForm({ patientId: '', doctorId: '', chiefComplaint: '', diagnosis: '', diagnosisCodeSystem: null, diagnosisCode: null, diagnosisDisplay: null, assessment: '', plan: '', followUpDate: '' });
                setConsultationMessage('Consultation finalized and saved to the patient record.');
            };

            const savePrescription = async () => {
                if (!prescriptionForm.patientId || !prescriptionForm.diagnosis.trim() || !prescriptionForm.formularyItemId || !prescriptionForm.dose.trim() || !prescriptionForm.doseUnit.trim() || !prescriptionForm.frequency.trim() || !prescriptionForm.route.trim() || !Number.isInteger(Number(prescriptionForm.quantity)) || Number(prescriptionForm.quantity) < 1) return setPrescriptionMessage('Patient, diagnosis, formulary medicine, dose, dose unit, frequency, route, and whole-number quantity are required.');
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return setPrescriptionMessage('The clinical database is unavailable. No prescription was saved.');
                const encounter = (appData.encounters || []).find((item) => item.patientId === prescriptionForm.patientId && !item.endedAt);
                const { data: prescriptionId, error } = await client.rpc('create_structured_prescription', {
                    p_patient_id: prescriptionForm.patientId, p_encounter_id: encounter?.id || null, p_diagnosis: prescriptionForm.diagnosis.trim(),
                    p_code_system: prescriptionForm.diagnosisCodeSystem, p_code: prescriptionForm.diagnosisCode, p_display: prescriptionForm.diagnosisDisplay,
                    p_formulary_item_id: prescriptionForm.formularyItemId, p_dose: Number(prescriptionForm.dose), p_dose_unit: prescriptionForm.doseUnit.trim(),
                    p_frequency: prescriptionForm.frequency.trim(), p_route: prescriptionForm.route.trim(), p_duration: prescriptionForm.duration.trim() || null,
                    p_quantity: Number(prescriptionForm.quantity), p_instructions: prescriptionForm.instructions.trim() || null, p_priority: prescriptionForm.priority
                });
                if (error || !prescriptionId) return setPrescriptionMessage(error?.message || 'Prescription was not saved.');
                const { data, error: fetchError } = await client.from('prescriptions').select('*').eq('id', prescriptionId).single();
                if (fetchError || !data) return setPrescriptionMessage('Prescription was saved, but the pharmacy queue could not refresh.');
                appData.prescriptions = [normalizePrescriptions([data])[0], ...(appData.prescriptions || [])];
                setPrescriptionForm({ patientId: '', diagnosis: '', diagnosisCodeSystem: null, diagnosisCode: null, diagnosisDisplay: null, formularyItemId: '', quantity: 1, dose: '', doseUnit: '', route: '', frequency: '', duration: '', instructions: '', priority: 'routine' });
                setPrescriptionMessage('Prescription sent to the pharmacy queue.');
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Consultation Notes</h2>
                            <p className="text-slate-500 mt-1">Record patient assessments, diagnosis, and follow-up care plans</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus} onClick={() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'clinical_workflows' }))}>New Encounter</Button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card title="New Consultation" className="lg:col-span-2">
                            <div className="space-y-4">
                                <Select label="Patient" value={form.patientId} onChange={(e) => setForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(getLiveStore().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                                <Select label="Clinician" value={form.doctorId} onChange={(e) => setForm(prev => ({ ...prev, doctorId: e.target.value }))} options={[{ value: '', label: 'Unassigned' }, ...(getLiveStore().users || []).filter(u => u.role === 'doctor').map(u => ({ value: u.id, label: u.name }))]} />
                                <Input label="Chief Complaint" value={form.chiefComplaint} onChange={(e) => setForm(prev => ({ ...prev, chiefComplaint: e.target.value }))} />
                                <CodedConceptInput label="Diagnosis" value={form.diagnosis} codeSystem={form.diagnosisCodeSystem} code={form.diagnosisCode} display={form.diagnosisDisplay} onChange={(term) => setForm(prev => ({ ...prev, diagnosis: term.value, diagnosisCodeSystem: term.codeSystem, diagnosisCode: term.code, diagnosisDisplay: term.display }))} />
                                <TextArea label="Assessment" value={form.assessment} onChange={(e) => setForm(prev => ({ ...prev, assessment: e.target.value }))} rows={3} />
                                <TextArea label="Plan / Treatment" value={form.plan} onChange={(e) => setForm(prev => ({ ...prev, plan: e.target.value }))} rows={3} />
                                <Input label="Follow-up Date" type="date" value={form.followUpDate} onChange={(e) => setForm(prev => ({ ...prev, followUpDate: e.target.value }))} />
                                {consultationMessage && <p className="text-sm text-slate-700" role="status">{consultationMessage}</p>}
                                <Button variant="primary" className="w-full justify-center" icon={Icons.Save} onClick={handleSaveConsultation}>Save Consultation</Button>
                            </div>
                        </Card>

                        <Card title="Clinical Summary">
                            <div className="space-y-3 text-sm text-slate-600">
                                <div className="flex justify-between"><span>Today</span><span className="font-medium text-slate-900">{consultations.length}</span></div>
                                <div className="flex justify-between"><span>Follow-ups</span><span className="font-medium text-slate-900">{consultations.filter(c => c.followUpDate).length}</span></div>
                                <div className="flex justify-between"><span>In review</span><span className="font-medium text-slate-900">{consultations.filter(c => c.status !== 'completed').length}</span></div>
                            </div>
                        </Card>
                    </div>

                    {['doctor','specialist','super_admin'].includes(user?.role) && <Card title="New prescription" subtitle="Urgent orders are highlighted in the pharmacy queue. Dispensing is recorded atomically against available stock.">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3"><Select label="Patient" value={prescriptionForm.patientId} onChange={(event) => setPrescriptionForm((form) => ({...form,patientId:event.target.value}))} options={[{value:'',label:'Select patient...'},...(appData.patients || []).map((patient) => ({value:patient.id,label:`${patient.firstName} ${patient.lastName}`}))]} /><CodedConceptInput label="Diagnosis" value={prescriptionForm.diagnosis} codeSystem={prescriptionForm.diagnosisCodeSystem} code={prescriptionForm.diagnosisCode} display={prescriptionForm.diagnosisDisplay} onChange={(term) => setPrescriptionForm((form) => ({...form,diagnosis:term.value,diagnosisCodeSystem:term.codeSystem,diagnosisCode:term.code,diagnosisDisplay:term.display}))} /><Select label="Formulary medicine" value={prescriptionForm.formularyItemId} onChange={(event) => { const selected = formulary.find((item) => item.id === event.target.value); setPrescriptionForm((form) => ({...form,formularyItemId:event.target.value,route:selected?.route || ''})); }} options={[{value:'',label:formulary.length ? 'Select medicine...' : 'No formulary items loaded'},...formulary.map((item) => ({value:item.id,label:`${item.generic_name} · ${item.strength} ${item.form} · ${item.route}${item.controlled ? ' · controlled' : ''}`}))]} /><Input label="Dose" type="number" min="0.0001" step="any" value={prescriptionForm.dose} onChange={(event) => setPrescriptionForm((form) => ({...form,dose:event.target.value}))} /><Input label="Dose unit" value={prescriptionForm.doseUnit} onChange={(event) => setPrescriptionForm((form) => ({...form,doseUnit:event.target.value}))} /><Input label="Quantity" type="number" min="1" step="1" value={prescriptionForm.quantity} onChange={(event) => setPrescriptionForm((form) => ({...form,quantity:event.target.value}))} /><Input label="Route" value={prescriptionForm.route} onChange={(event) => setPrescriptionForm((form) => ({...form,route:event.target.value}))} /><Input label="Frequency" value={prescriptionForm.frequency} onChange={(event) => setPrescriptionForm((form) => ({...form,frequency:event.target.value}))} /><Input label="Duration" value={prescriptionForm.duration} onChange={(event) => setPrescriptionForm((form) => ({...form,duration:event.target.value}))} /><Input label="Instructions" value={prescriptionForm.instructions} onChange={(event) => setPrescriptionForm((form) => ({...form,instructions:event.target.value}))} /><Select label="Priority" value={prescriptionForm.priority} onChange={(event) => setPrescriptionForm((form) => ({...form,priority:event.target.value}))} options={['routine','urgent','emergency'].map((value) => ({value,label:value}))} /></div>
                        {prescriptionMessage && <p className="mt-3 text-sm text-slate-700" role="status">{prescriptionMessage}</p>}<Button className="mt-4" variant="primary" onClick={savePrescription}>Send prescription to pharmacy</Button>
                    </Card>}

                    <Card title="Recent Encounters">
                        <DataTable
                            columns={[
                                { key: 'createdAt', title: 'Date', render: (row) => formatDateTime(row.createdAt) },
                                { key: 'patient', title: 'Patient', render: (row) => {
                                    const patient = appData.patients.find(p => p.id === row.patientId);
                                    return patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown';
                                }},
                                { key: 'chiefComplaint', title: 'Complaint' },
                                { key: 'diagnosis', title: 'Diagnosis' },
                                { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : 'default'}>{row.status}</Badge> }
                            ]}
                            data={consultations.slice(0, 10)}
                        />
                    </Card>
                </div>
            );
        };

        const VitalsModule = () => {
            const { user } = useAuth();
            const [vitals, setVitals] = useState(getLiveStore().vitals || []);
            const [form, setForm] = useState({ patientId: '', temperature: '', heartRate: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', oxygenSaturation: '', respiratoryRate: '', weight: '', height: '', painScore: '0', consciousness: 'A', supplementalOxygen: false, spo2Scale: 'scale_1' });
            const [vitalsMessage, setVitalsMessage] = useState('');

            const handleSaveVitals = async () => {
                if (!form.patientId) return setVitalsMessage('Select a patient before recording observations.');
                const ranges = { temperature:[25,45], heartRate:[0,300], bloodPressureSystolic:[0,300], bloodPressureDiastolic:[0,200], oxygenSaturation:[0,100], respiratoryRate:[0,100], weight:[0,500], height:[0,280], painScore:[0,10] };
                const invalid = Object.entries(ranges).find(([key,[min,max]]) => form[key] !== '' && (!Number.isFinite(Number(form[key])) || Number(form[key]) < min || Number(form[key]) > max));
                if (invalid) return setVitalsMessage(`${invalid[0]} is outside the permitted measurement range. Check the value and units.`);
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return setVitalsMessage('The clinical database is unavailable. No observations were saved.');
                const numericOrNull = (value) => value === '' ? null : Number(value);
                const encounter = (appData.encounters || []).find((item) => item.patientId === form.patientId && !item.endedAt);
                const { data, error } = await client.from('vital_signs').insert({
                    patient_id: form.patientId, encounter_id: encounter?.id || null, recorded_by: user?.id || null, temperature: numericOrNull(form.temperature), heart_rate: numericOrNull(form.heartRate),
                    blood_pressure_systolic: numericOrNull(form.bloodPressureSystolic), blood_pressure_diastolic: numericOrNull(form.bloodPressureDiastolic),
                    oxygen_saturation: numericOrNull(form.oxygenSaturation), respiratory_rate: numericOrNull(form.respiratoryRate),
                    weight: numericOrNull(form.weight), height: numericOrNull(form.height),
                    bmi: Number(form.weight) > 0 && Number(form.height) > 0 ? Number((Number(form.weight) / ((Number(form.height) / 100) ** 2)).toFixed(1)) : null,
                    pain_score: numericOrNull(form.painScore), consciousness: form.consciousness, supplemental_oxygen: form.supplementalOxygen, spo2_scale: form.spo2Scale
                }).select();
                if (error || !data?.[0]) return setVitalsMessage(error?.message || 'Observations were not saved.');
                const next = [normalizeVitals(data)[0], ...vitals];
                appData.vitals = next;
                setVitals(next);
                setForm({ patientId: '', temperature: '', heartRate: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', oxygenSaturation: '', respiratoryRate: '', weight: '', height: '', painScore: '0', consciousness: 'A', supplementalOxygen: false, spo2Scale: 'scale_1' });
                const savedVital = data[0];
                const scoreName = savedVital.score_system === 'news2' ? 'NEWS2' : savedVital.score_system === 'pews' ? 'PEWS' : null;
                const scoreValue = savedVital.news2_score ?? savedVital.pews_score;
                const scoreSummary = scoreName ? `${scoreName}: ${savedVital.score_status === 'pending_clinical_approval' && scoreValue == null ? 'pending clinical approval' : scoreValue ?? 'incomplete'}${scoreValue != null && savedVital.score_status === 'pending_clinical_approval' ? ' (pending clinical approval)' : ''}.` : 'Age unavailable; early warning score not calculated.';
                setVitalsMessage(`Observations saved. ${scoreSummary} Corrections should be entered as a new audited observation.`);
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Vital Signs</h2>
                            <p className="text-slate-500 mt-1">Track patient condition trends and clinical alerts</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card title="Record Vitals" className="lg:col-span-2">
                            <div className="space-y-4">
                                <Select label="Patient" value={form.patientId} onChange={(e) => setForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(getLiveStore().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                                <div className="grid grid-cols-2 gap-4">
                                    <Input label="Temperature (°C)" value={form.temperature} onChange={(e) => setForm(prev => ({ ...prev, temperature: e.target.value }))} />
                                    <Input label="Heart Rate" value={form.heartRate} onChange={(e) => setForm(prev => ({ ...prev, heartRate: e.target.value }))} />
                                    <Input label="BP Systolic" value={form.bloodPressureSystolic} onChange={(e) => setForm(prev => ({ ...prev, bloodPressureSystolic: e.target.value }))} />
                                    <Input label="BP Diastolic" value={form.bloodPressureDiastolic} onChange={(e) => setForm(prev => ({ ...prev, bloodPressureDiastolic: e.target.value }))} />
                                    <Input label="SpO2 (%)" value={form.oxygenSaturation} onChange={(e) => setForm(prev => ({ ...prev, oxygenSaturation: e.target.value }))} />
                                    <Input label="Resp Rate" value={form.respiratoryRate} onChange={(e) => setForm(prev => ({ ...prev, respiratoryRate: e.target.value }))} />
                                    <Select label="Consciousness (AVPU/ACVPU)" value={form.consciousness} onChange={(e) => setForm(prev => ({ ...prev, consciousness: e.target.value }))} options={[{value:'A',label:'A — Alert'},{value:'C',label:'C — New confusion'},{value:'V',label:'V — Responds to voice'},{value:'P',label:'P — Responds to pain'},{value:'U',label:'U — Unresponsive'}]} />
                                    <Select label="Supplemental oxygen" value={form.supplementalOxygen ? 'yes' : 'no'} onChange={(e) => setForm(prev => ({ ...prev, supplementalOxygen: e.target.value === 'yes' }))} options={[{value:'no',label:'No'},{value:'yes',label:'Yes'}]} />
                                    <Select label="NEWS2 SpO₂ scale (scale 2 only when prescribed)" value={form.spo2Scale} onChange={(e) => setForm(prev => ({ ...prev, spo2Scale: e.target.value }))} options={[{value:'scale_1',label:'Scale 1 — standard'},{value:'scale_2',label:'Scale 2 — prescribed target 88–92%'}]} />
                                    <Input label="Weight (kg)" type="number" min="0" step="0.1" value={form.weight} onChange={(e) => setForm(prev => ({ ...prev, weight: e.target.value }))} />
                                    <Input label="Height (cm)" type="number" min="0" step="0.1" value={form.height} onChange={(e) => setForm(prev => ({ ...prev, height: e.target.value }))} />
                                </div>
                                {Number(form.weight) > 0 && Number(form.height) > 0 && <p className="text-sm text-slate-600" role="status">Calculated BMI: {(Number(form.weight) / ((Number(form.height) / 100) ** 2)).toFixed(1)} kg/m²</p>}
                                <Input label="Pain Score (0-10)" value={form.painScore} onChange={(e) => setForm(prev => ({ ...prev, painScore: e.target.value }))} />
                                {vitalsMessage && <p className="text-sm text-slate-700" role="status">{vitalsMessage}</p>}
                                <Button variant="primary" className="w-full justify-center" icon={Icons.Save} onClick={handleSaveVitals}>Save Vital Signs</Button>
                            </div>
                        </Card>

                        <Card title="Clinical Alerts">
                            <div className="space-y-3 text-sm">
                                <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-700">Critical alerts are generated automatically for unsafe vital signs.</div>
                                <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-amber-700">Review low oxygen saturation and blood pressure readings promptly.</div>
                            </div>
                        </Card>
                    </div>

                    <Card title="Recent Vitals">
                        <DataTable
                            columns={[
                                { key: 'timestamp', title: 'Recorded', render: (row) => formatDateTime(row.timestamp) },
                                { key: 'patient', title: 'Patient', render: (row) => {
                                    const patient = appData.patients.find(p => p.id === row.patientId);
                                    return patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown';
                                }},
                                { key: 'heartRate', title: 'HR' },
                                { key: 'bloodPressure', title: 'BP', render: (row) => `${row.bloodPressureSystolic}/${row.bloodPressureDiastolic}` },
                                { key: 'oxygenSaturation', title: 'SpO2' }
                            ]}
                            data={vitals.slice(0, 12)}
                        />
                    </Card>
                </div>
            );
        };

        const ClinicalSafetyModule = () => {
            const { user } = useAuth();
            const [allergies, setAllergies] = useState(getLiveStore().allergies || []);
            const [conditions, setConditions] = useState(getLiveStore().conditions || []);
            const [carePlans, setCarePlans] = useState(getLiveStore().carePlans || []);
            const [alerts, setAlerts] = useState(getLiveStore().clinicalAlerts || []);
            const [resultAcknowledgements, setResultAcknowledgements] = useState(getLiveStore().resultAcknowledgements || []);
            const [allergyForm, setAllergyForm] = useState({ patientId: '', substance: '', codeSystem: null, code: null, display: null, reaction: '', severity: 'moderate', criticality: 'low' });
            const [conditionForm, setConditionForm] = useState({ patientId: '', conditionName: '', codeSystem: null, code: null, display: null, onsetDate: '' });
            const [carePlanForm, setCarePlanForm] = useState({ patientId: '', title: '', description: '', targetDate: '' });
            const patients = getLiveStore().patients || [];

            const save = async (table, payload, setter, appTable, mapper) => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return false;
                const { data, error } = await client.from(table).insert([payload]).select();
                if (error || !data?.[0]) { console.error(`Unable to save ${table}`, error); return false; }
                const record = mapper([data[0]])[0];
                const next = [record, ...(appTable === 'allergies' ? allergies : appTable === 'conditions' ? conditions : carePlans)];
                appData[appTable] = next;
                setter(next);
                return true;
            };

            const latestVitals = (appData.vitals || []).filter(v => Number(v.oxygenSaturation) < 90 || Number(v.bloodPressureSystolic) < 90 || Number(v.temperature) >= 39);
            const activeAlerts = [...alerts, ...latestVitals.map(v => ({ id: `vital-${v.id}`, patientId: v.patientId, severity: 'critical', alertType: 'vital', message: `Abnormal vital signs recorded ${formatDateTime(v.timestamp)}`, status: 'open' }))]
                .filter(alert => alert.status === 'open');
            const patientOptions = [{ value: '', label: 'Select patient...' }, ...patients.map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))];
            const patientName = (id) => {
                const patient = patients.find(p => p.id === id);
                return patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown';
            };

            const addAllergy = async () => {
                if (!allergyForm.patientId || !allergyForm.substance) return;
                const saved = await save('patient_allergies', {
                    patient_id: allergyForm.patientId, substance: allergyForm.substance, code_system: allergyForm.codeSystem, code: allergyForm.code, display: allergyForm.display, reaction: allergyForm.reaction,
                    severity: allergyForm.severity, criticality: allergyForm.criticality, category: 'medication', clinical_status: 'active'
                }, setAllergies, 'allergies', normalizeAllergies);
                if (saved) setAllergyForm({ patientId: '', substance: '', codeSystem: null, code: null, display: null, reaction: '', severity: 'moderate', criticality: 'low' });
            };
            const addCondition = async () => {
                if (!conditionForm.patientId || !conditionForm.conditionName) return;
                const saved = await save('patient_conditions', {
                    patient_id: conditionForm.patientId, condition_name: conditionForm.conditionName, code_system: conditionForm.codeSystem, code: conditionForm.code, display: conditionForm.display,
                    onset_date: conditionForm.onsetDate || null, clinical_status: 'active', verification_status: 'provisional'
                }, setConditions, 'conditions', normalizeConditions);
                if (saved) setConditionForm({ patientId: '', conditionName: '', codeSystem: null, code: null, display: null, onsetDate: '' });
            };
            const addCarePlan = async () => {
                if (!carePlanForm.patientId || !carePlanForm.title) return;
                const saved = await save('care_plans', {
                    patient_id: carePlanForm.patientId, title: carePlanForm.title, description: carePlanForm.description,
                    target_date: carePlanForm.targetDate || null, status: 'active'
                }, setCarePlans, 'carePlans', normalizeCarePlans);
                if (saved) setCarePlanForm({ patientId: '', title: '', description: '', targetDate: '' });
            };

            const acknowledgeResult = async (acknowledgement) => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client || !user?.id) return notifyPersistenceFailure('acknowledge result');
                const method = window.prompt('How was this result communicated? (for example: phone, in person, secure message)');
                if (!method?.trim()) return;
                const isCritical = acknowledgement.severity === 'critical';
                const readBackConfirmed = !isCritical || window.confirm('Did the recipient read back the critical result correctly?');
                if (isCritical && !readBackConfirmed) return;
                const readBackNotes = isCritical ? window.prompt('Record the critical result read-back details:') : null;
                if (isCritical && !readBackNotes?.trim()) return;
                const { data, error } = await client.from('result_acknowledgements').update({
                    status: 'acknowledged', acknowledged_at: new Date().toISOString(), acknowledged_by: user.id,
                    acknowledgement_method: method.trim(), read_back_confirmed: readBackConfirmed,
                    read_back_notes: readBackNotes?.trim() || null
                }).eq('id', acknowledgement.id).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('acknowledge result', error);
                const updated = normalizeResultAcknowledgements(data)[0];
                const next = resultAcknowledgements.map((item) => item.id === updated.id ? updated : item);
                appData.resultAcknowledgements = next;
                setResultAcknowledgements(next);
            };

            const pendingAcknowledgements = resultAcknowledgements.filter((item) => ['unacknowledged', 'escalated'].includes(item.status));

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">Clinical Safety</h2>
                        <p className="text-slate-500 mt-1">Maintain the allergy and problem lists, care plans, and actionable safety alerts.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard title="Open alerts" value={activeAlerts.length} icon={Icons.AlertCircle} color="red" />
                        <StatCard title="Active allergies" value={allergies.filter(a => a.clinicalStatus === 'active').length} icon={Icons.Shield} color="amber" />
                        <StatCard title="Active problems" value={conditions.filter(c => c.clinicalStatus === 'active').length} icon={Icons.ClipboardList} color="medical" />
                        <StatCard title="Active care plans" value={carePlans.filter(c => c.status === 'active').length} icon={Icons.CheckCircle} color="emerald" />
                    </div>
                    <Card title="Results awaiting acknowledgement" subtitle="Final results must be reviewed by an authorized clinician.">
                        <DataTable
                            columns={[
                                { key: 'patient', title: 'Patient', render: (row) => patientName(row.patientId) },
                                { key: 'resultType', title: 'Result type' },
                                { key: 'severity', title: 'Severity', render: (row) => <Badge variant={row.severity === 'critical' ? 'danger' : row.severity === 'urgent' ? 'warning' : 'neutral'}>{row.severity || 'routine'}</Badge> },
                                { key: 'dueAt', title: 'Due', render: (row) => formatDateTime(row.dueAt) },
                                { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'escalated' ? 'danger' : 'warning'}>{row.status}</Badge> }
                            ]}
                            data={pendingAcknowledgements}
                            emptyMessage="No final results are awaiting acknowledgement."
                            actions={(row) => <Button size="sm" variant="primary" onClick={() => acknowledgeResult(row)}>Acknowledge</Button>}
                        />
                    </Card>
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <Card title="Record allergy / intolerance">
                            <div className="space-y-3">
                                <Select label="Patient" value={allergyForm.patientId} onChange={(e) => setAllergyForm({ ...allergyForm, patientId: e.target.value })} options={patientOptions} />
                                <CodedConceptInput label="Allergen or substance" value={allergyForm.substance} codeSystem={allergyForm.codeSystem} code={allergyForm.code} display={allergyForm.display} onChange={(term) => setAllergyForm((form) => ({...form,substance:term.value,codeSystem:term.codeSystem,code:term.code,display:term.display}))} />
                                <Input label="Reaction" value={allergyForm.reaction} onChange={(e) => setAllergyForm({ ...allergyForm, reaction: e.target.value })} />
                                <Select label="Severity" value={allergyForm.severity} onChange={(e) => setAllergyForm({ ...allergyForm, severity: e.target.value })} options={['mild','moderate','severe'].map(value => ({ value, label: value }))} />
                                <Button variant="primary" className="w-full justify-center" icon={Icons.Save} onClick={addAllergy}>Save Allergy</Button>
                            </div>
                        </Card>
                        <Card title="Add problem to list">
                            <div className="space-y-3">
                                <Select label="Patient" value={conditionForm.patientId} onChange={(e) => setConditionForm({ ...conditionForm, patientId: e.target.value })} options={patientOptions} />
                                <CodedConceptInput label="Condition" value={conditionForm.conditionName} codeSystem={conditionForm.codeSystem} code={conditionForm.code} display={conditionForm.display} onChange={(term) => setConditionForm((form) => ({...form,conditionName:term.value,codeSystem:term.codeSystem,code:term.code,display:term.display}))} />
                                <Input label="Onset date" type="date" value={conditionForm.onsetDate} onChange={(e) => setConditionForm({ ...conditionForm, onsetDate: e.target.value })} />
                                <Button variant="primary" className="w-full justify-center" icon={Icons.Save} onClick={addCondition}>Add Problem</Button>
                            </div>
                        </Card>
                        <Card title="Start care plan">
                            <div className="space-y-3">
                                <Select label="Patient" value={carePlanForm.patientId} onChange={(e) => setCarePlanForm({ ...carePlanForm, patientId: e.target.value })} options={patientOptions} />
                                <Input label="Plan title" value={carePlanForm.title} onChange={(e) => setCarePlanForm({ ...carePlanForm, title: e.target.value })} />
                                <TextArea label="Plan details" rows={2} value={carePlanForm.description} onChange={(e) => setCarePlanForm({ ...carePlanForm, description: e.target.value })} />
                                <Input label="Target date" type="date" value={carePlanForm.targetDate} onChange={(e) => setCarePlanForm({ ...carePlanForm, targetDate: e.target.value })} />
                                <Button variant="primary" className="w-full justify-center" icon={Icons.Save} onClick={addCarePlan}>Save Care Plan</Button>
                            </div>
                        </Card>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <Card title="Safety alerts requiring review"><DataTable columns={[
                            { key: 'severity', title: 'Severity', render: row => <Badge variant={row.severity === 'critical' ? 'danger' : 'warning'}>{row.severity}</Badge> },
                            { key: 'patient', title: 'Patient', render: row => patientName(row.patientId) },
                            { key: 'message', title: 'Alert' }
                        ]} data={activeAlerts.slice(0, 10)} /></Card>
                        <Card title="Current allergy & problem list"><DataTable columns={[
                            { key: 'patient', title: 'Patient', render: row => patientName(row.patientId) },
                            { key: 'item', title: 'Item', render: row => row.substance || row.conditionName },
                            { key: 'details', title: 'Details', render: row => row.reaction || row.verificationStatus || 'Active' },
                            { key: 'severity', title: 'Safety level', render: row => <Badge variant={row.severity === 'severe' ? 'danger' : 'warning'}>{row.severity || row.clinicalStatus}</Badge> }
                        ]} data={[...allergies, ...conditions].slice(0, 10)} /></Card>
                    </div>
                </div>
            );
        };

        const InventoryModule = () => {
            const { user } = useAuth();
            const [inventory, setInventory] = useState(getLiveStore().pharmacyInventory || []);
            const [search, setSearch] = useState('');
            const [showAddItem, setShowAddItem] = useState(false);
            const [saving, setSaving] = useState(false);
            const [message, setMessage] = useState('');
            const [formularyItems, setFormularyItems] = useState([]);
            const [itemForm, setItemForm] = useState({ formularyItemId: '', name: '', genericName: '', category: 'General', stockQuantity: '0', reorderLevel: '0', unitPrice: '0', expiryDate: '', batchNumber: '', barcode: '', supplier: '', location: '' });

            useEffect(() => {
                const client = window.OneMedSupabase?.getClient?.();
                if (client) client.from('formulary_items').select('id,generic_name,form,strength,route').eq('active', true).order('generic_name')
                    .then(({ data, error }) => { if (!error && data) setFormularyItems(data); });
            }, []);

            const filtered = (inventory || []).filter(item => ((item.name || '') + (item.category || '')).toLowerCase().includes(search.toLowerCase()));

            const handleAddItem = async () => {
                const quantity = Number(itemForm.stockQuantity);
                const reorder = Number(itemForm.reorderLevel);
                const price = Number(itemForm.unitPrice);
                const selectedFormularyItem = formularyItems.find((item) => item.id === itemForm.formularyItemId);
                if (!selectedFormularyItem) return setMessage('Select an active formulary item.');
                if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(reorder) || reorder < 0 || !Number.isFinite(price) || price < 0) {
                    return setMessage('Stock and reorder quantities must be whole numbers, and the unit price cannot be negative.');
                }
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return setMessage('Supabase is unavailable. No inventory item was saved.');
                setSaving(true);
                setMessage('');
                const payload = {
                    formulary_item_id: selectedFormularyItem.id,
                    name: selectedFormularyItem.generic_name,
                    generic_name: selectedFormularyItem.generic_name,
                    category: itemForm.category.trim() || null,
                    stock_quantity: quantity,
                    reorder_level: reorder,
                    unit_price: price,
                    expiry_date: itemForm.expiryDate || null,
                    batch_number: itemForm.batchNumber.trim() || null,
                    barcode: itemForm.barcode.trim() || null,
                    supplier: itemForm.supplier.trim() || null,
                    location: itemForm.location.trim() || null,
                    status: quantity <= reorder ? 'low_stock' : 'active'
                };
                const { data, error } = await client.from('pharmacy_inventory').insert(payload).select().single();
                setSaving(false);
                if (error || !data) return setMessage(error?.message || 'Inventory item could not be saved.');
                const next = [...inventory, normalizeInventory([data])[0]];
                appData.pharmacyInventory = next;
                persistStoreTable('pharmacyInventory', next);
                setInventory(next);
                setItemForm({ formularyItemId: '', name: '', genericName: '', category: 'General', stockQuantity: '0', reorderLevel: '0', unitPrice: '0', expiryDate: '', batchNumber: '', barcode: '', supplier: '', location: '' });
                setMessage('');
                setShowAddItem(false);
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Inventory & Stock Control</h2>
                            <p className="text-slate-500 mt-1">Monitor stock levels, expiry dates, and reorder alerts</p>
                        </div>
                        {['super_admin', 'pharmacist'].includes(user?.role) && <Button variant="primary" icon={Icons.Plus} onClick={() => { setMessage(''); setShowAddItem(true); }}>Add Item</Button>}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Total SKUs" value={inventory.length} icon={Icons.Package} color="medical" />
                        <StatCard title="Low Stock" value={inventory.filter(item => Number(item.stockQuantity) <= Number(item.reorderLevel)).length} icon={Icons.AlertCircle} color="amber" />
                        <StatCard title="Expiring" value={inventory.filter(item => {
                            if (!item.expiryDate) return false;
                            const expiry = new Date(item.expiryDate);
                            const now = new Date();
                            return expiry > now && (expiry - now) / (1000 * 60 * 60 * 24) <= 90;
                        }).length} icon={Icons.Clock} color="red" />
                        <StatCard title="Value" value={formatCurrency(inventory.reduce((sum, item) => sum + Number(item.stockQuantity || 0) * Number(item.unitPrice || 0), 0))} icon={Icons.DollarSign} color="emerald" />
                    </div>

                    <Card>
                        <div className="mb-4">
                            <SearchBar value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inventory..." />
                        </div>
                        <DataTable
                            columns={[
                                { key: 'name', title: 'Medication', render: (row) => <span className="font-medium">{row.name}</span> },
                                { key: 'genericName', title: 'Generic' },
                                { key: 'category', title: 'Category' },
                                { key: 'stockQuantity', title: 'Stock' },
                                { key: 'reorderLevel', title: 'Reorder' },
                                { key: 'expiryDate', title: 'Expiry', render: (row) => formatDate(row.expiryDate) },
                                { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'low_stock' ? 'warning' : 'success'}>{row.status}</Badge> }
                            ]}
                            data={filtered}
                        />
                    </Card>
                    <Modal isOpen={showAddItem} onClose={() => { if (!saving) setShowAddItem(false); }} title="Add Medication to Inventory" size="md" footer={<div className="flex justify-end gap-3"><Button variant="ghost" disabled={saving} onClick={() => setShowAddItem(false)}>Cancel</Button><Button variant="primary" disabled={saving} icon={saving ? Icons.RefreshCw : Icons.Save} onClick={handleAddItem}>{saving ? 'Saving…' : 'Save Item'}</Button></div>}>
                        <div className="grid grid-cols-2 gap-4">
                            <Select label="Formulary item" required value={itemForm.formularyItemId} onChange={(event) => { const item = formularyItems.find((entry) => entry.id === event.target.value); setItemForm((form) => ({ ...form, formularyItemId: event.target.value, name: item?.generic_name || '', genericName: item?.generic_name || '' })); }} options={[{value:'',label:formularyItems.length ? 'Select formulary item...' : 'No active formulary items'},...formularyItems.map((item) => ({value:item.id,label:`${item.generic_name} · ${item.strength} ${item.form} · ${item.route}`}))]} className="col-span-2" />
                            <Input label="Generic name" value={itemForm.genericName} disabled className="col-span-2" />
                            <Input label="Category" value={itemForm.category} onChange={(event) => setItemForm((form) => ({ ...form, category: event.target.value }))} />
                            <Input label="Opening stock" type="number" min="0" step="1" value={itemForm.stockQuantity} onChange={(event) => setItemForm((form) => ({ ...form, stockQuantity: event.target.value }))} />
                            <Input label="Reorder level" type="number" min="0" step="1" value={itemForm.reorderLevel} onChange={(event) => setItemForm((form) => ({ ...form, reorderLevel: event.target.value }))} />
                            <Input label="Unit price (NGN)" type="number" min="0" step="0.01" value={itemForm.unitPrice} onChange={(event) => setItemForm((form) => ({ ...form, unitPrice: event.target.value }))} />
                            <Input label="Expiry date" type="date" value={itemForm.expiryDate} onChange={(event) => setItemForm((form) => ({ ...form, expiryDate: event.target.value }))} />
                            <Input label="Batch / lot number" value={itemForm.batchNumber} onChange={(event) => setItemForm((form) => ({ ...form, batchNumber: event.target.value }))} />
                            <Input label="Barcode" value={itemForm.barcode} onChange={(event) => setItemForm((form) => ({ ...form, barcode: event.target.value }))} />
                            <Input label="Supplier" value={itemForm.supplier} onChange={(event) => setItemForm((form) => ({ ...form, supplier: event.target.value }))} />
                            <Input label="Storage location" value={itemForm.location} onChange={(event) => setItemForm((form) => ({ ...form, location: event.target.value }))} className="col-span-2" />
                            {message && <p role="alert" className="col-span-2 text-sm text-red-700">{message}</p>}
                        </div>
                    </Modal>
                </div>
            );
        };

        const ClinicalWorkflowsModule = () => {
            const { user } = useAuth();
            const [tab, setTab] = useState('encounters');
            const [encounters, setEncounters] = useState(getLiveStore().encounters || []);
            const [immunizations, setImmunizations] = useState(getLiveStore().immunizations || []);
            const [administrations, setAdministrations] = useState(getLiveStore().medicationAdministrations || []);
            const isRegistrationOnly = ['records_officer', 'receptionist'].includes(user?.role);
            const [unknownIdentity, setUnknownIdentity] = useState(false);
            const [intakeMessage, setIntakeMessage] = useState('');
            const [bidEncounter, setBidEncounter] = useState(null);
            const [bidForm, setBidForm] = useState({ status: 'under_assessment', notes: '', disposition: '' });
            const [encounterForm, setEncounterForm] = useState({ patientId: '', encounterType: 'outpatient', caseType: 'routine', location: '', reason: '', arrivalMode: '', referralSource: '', accompanyingPerson: '', presentingEmergency: '', triagePriority: 'routine' });
            const [immunizationForm, setImmunizationForm] = useState({ patientId: '', vaccine: '', administeredDate: formatFacilityDate(), nextDueDate: '', notes: '' });
            const [administrationForm, setAdministrationForm] = useState({ patientId: '', prescriptionItemId: '', dosage: '', notes: '' });
            const [prescribedMedicationItems, setPrescribedMedicationItems] = useState([]);
            const patients = getLiveStore().patients || [];
            const patientOptions = [{ value: '', label: 'Select patient...' }, ...patients.map((patient) => ({ value: patient.id, label: `${patient.firstName} ${patient.lastName}` }))];
            const patientName = (id) => {
                const patient = patients.find((item) => item.id === id);
                return patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown';
            };

            useEffect(() => {
                if (!administrationForm.patientId) { setPrescribedMedicationItems([]); return; }
                setPrescribedMedicationItems([]);
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return;
                client.from('prescriptions').select('id').eq('patient_id', administrationForm.patientId).in('status', ['active', 'dispensed'])
                    .then(async ({ data: prescriptions, error }) => {
                        if (error || !prescriptions?.length) { setPrescribedMedicationItems([]); return; }
                        const { data, error: itemError } = await client.from('prescription_items')
                            .select('id,prescription_id,formulary_item_id,dose,dose_unit,route,formulary_items(generic_name,strength,form)')
                            .in('prescription_id', prescriptions.map((row) => row.id));
                        setPrescribedMedicationItems(itemError ? [] : data || []);
                    });
            }, [administrationForm.patientId]);

            const saveEncounter = async () => {
                if ((!encounterForm.patientId && !unknownIdentity) || !encounterForm.reason.trim()) return setIntakeMessage('Select a patient or use unidentified emergency registration, and enter presenting circumstances.');
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('start encounter');
                if (unknownIdentity) {
                    if (encounterForm.caseType !== 'emergency') return setIntakeMessage('Unidentified registration is only available for an emergency encounter.');
                    const { data: encounterId, error: unknownError } = await client.rpc('register_unidentified_emergency', { p_reason: encounterForm.reason.trim(), p_arrival_mode: encounterForm.arrivalMode || null, p_presenting_emergency: encounterForm.presentingEmergency || encounterForm.reason.trim(), p_triage_priority: encounterForm.triagePriority, p_referral_source: encounterForm.referralSource || null, p_accompanying_person: encounterForm.accompanyingPerson || null });
                    if (unknownError || !encounterId) return setIntakeMessage(unknownError?.message || 'Emergency registration was not saved.');
                    setUnknownIdentity(false); setIntakeMessage(`Temporary emergency record created. Encounter ${encounterId.slice(0,8)} is in the doctor queue for identity verification and care.`);
                    window.dispatchEvent(new CustomEvent('onemed:refresh-data'));
                    return;
                }
                const isBID = encounterForm.caseType === 'bid';
                const initialStatus = ['doctor', 'nurse', 'super_admin'].includes(user?.role) && !isBID ? 'in_progress' : 'arrived';
                const encounterType = encounterForm.caseType === 'emergency' || isBID ? 'emergency' : encounterForm.encounterType;
                const { data, error } = await client.from('encounters').insert({ patient_id: encounterForm.patientId, registration_staff_id: user?.id || null, attending_clinician_id: ['doctor','specialist','super_admin'].includes(user?.role) && isBID ? user?.id : null, encounter_type: encounterType, location: encounterForm.location || null, reason_for_visit: encounterForm.reason.trim(), status: initialStatus, case_type: encounterForm.caseType, arrival_mode: encounterForm.arrivalMode || null, referral_source: encounterForm.referralSource || null, accompanying_person: encounterForm.accompanyingPerson || null, presenting_emergency: encounterForm.presentingEmergency || null, triage_priority: encounterForm.triagePriority, death_assessment_status: isBID ? 'assessment_required' : null }).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('start encounter', error);
                const next = [normalizeEncounters(data)[0], ...encounters];
                const { error: historyError } = await client.from('encounter_workflow_events').insert({ encounter_id: data[0].id, patient_id: data[0].patient_id, event_type: isBID ? 'bid_case_registered' : encounterForm.caseType === 'emergency' ? 'emergency_registered' : 'encounter_registered', to_status: initialStatus, department: ['doctor','nurse','super_admin'].includes(user?.role) && !isBID ? 'Clinical Intake' : 'Health Information Management', notes: encounterForm.reason.trim(), actor_id: user?.id });
                if (historyError) window.dispatchEvent(new CustomEvent('onemed:persistence-error', { detail: 'Encounter was registered, but its workflow history could not be saved. Contact an administrator.' }));
                persistStoreTable('encounters', next); setEncounters(next); setIntakeMessage(isBID ? 'BID/BOD case recorded and awaiting authorized doctor assessment.' : 'Encounter registered.');
                setEncounterForm({ patientId: '', encounterType: 'outpatient', caseType: 'routine', location: '', reason: '', arrivalMode: '', referralSource: '', accompanyingPerson: '', presentingEmergency: '', triagePriority: 'routine' });
            };
            const saveImmunization = async () => {
                if (!immunizationForm.patientId || !immunizationForm.vaccine.trim()) return;
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('record immunization');
                const { data, error } = await client.from('immunizations').insert({ patient_id: immunizationForm.patientId, vaccine: immunizationForm.vaccine.trim(), status: 'administered', administered_date: immunizationForm.administeredDate || null, next_due_date: immunizationForm.nextDueDate || null, notes: immunizationForm.notes || null }).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('record immunization', error);
                const next = [normalizeImmunizations(data)[0], ...immunizations];
                persistStoreTable('immunizations', next); setImmunizations(next);
                setImmunizationForm({ patientId: '', vaccine: '', administeredDate: formatFacilityDate(), nextDueDate: '', notes: '' });
            };
            const saveAdministration = async () => {
                const prescribedItem = prescribedMedicationItems.find((item) => item.id === administrationForm.prescriptionItemId);
                if (!administrationForm.patientId || !prescribedItem) return;
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('record medication administration');
                const { data, error } = await client.from('medication_administrations').insert({ patient_id: administrationForm.patientId, prescription_item_id: prescribedItem.id, formulary_item_id: prescribedItem.formulary_item_id, medication_name: prescribedItem.formulary_items?.generic_name || 'Prescribed medication', dosage: administrationForm.dosage || `${prescribedItem.dose} ${prescribedItem.dose_unit}`, administered_by: user?.id || null, notes: administrationForm.notes || null }).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('record medication administration', error);
                const next = [normalizeMedicationAdministrations(data)[0], ...administrations];
                persistStoreTable('medicationAdministrations', next); setAdministrations(next);
                setAdministrationForm({ patientId: '', prescriptionItemId: '', dosage: '', notes: '' });
            };
            const completeEncounter = async (encounter) => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('complete encounter');
                const { data, error } = await client.from('encounters').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', encounter.id).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('complete encounter', error);
                const patientId = encounter.patientId || encounter.patient_id;
                const event = await client.from('encounter_workflow_events').insert({ encounter_id: encounter.id, patient_id: patientId, event_type: 'encounter_completed', from_status: encounter.status, to_status: 'completed', department: 'Clinical Care', actor_id: user?.id });
                const updated = normalizeEncounters(data)[0]; const next = encounters.map((item) => item.id === updated.id ? updated : item);
                persistStoreTable('encounters', next); setEncounters(next);
                if (event.error) notifyPersistenceFailure('record encounter completion', event.error);
            };
            const saveBidAssessment = async () => {
                if (!bidEncounter || !bidForm.notes.trim()) return setIntakeMessage('Document the clinical assessment before saving.');
                if (bidForm.status === 'death_confirmed' && !bidForm.disposition.trim()) return setIntakeMessage('Record the authorized disposition for a confirmed death.');
                const client = window.OneMedSupabase?.getClient?.();
                const { data, error } = await client.from('encounters').update({ death_assessment_status: bidForm.status, death_assessment_notes: bidForm.notes.trim(), disposition: bidForm.disposition.trim() || null }).eq('id', bidEncounter.id).select().single();
                if (error || !data) return setIntakeMessage(error?.message || 'BID/BOD assessment could not be saved.');
                await client.from('encounter_workflow_events').insert({ encounter_id: bidEncounter.id, patient_id: bidEncounter.patientId || bidEncounter.patient_id, event_type: 'bid_clinical_assessment_recorded', to_status: bidForm.status, department: 'Medical / Emergency', notes: bidForm.notes.trim(), actor_id: user?.id });
                const updated = normalizeEncounters([data])[0];
                const next = encounters.map((item) => item.id === updated.id ? updated : item);
                appData.encounters = next; setEncounters(next); persistStoreTable('encounters', next);
                setBidEncounter(null); setBidForm({ status: 'under_assessment', notes: '', disposition: '' }); setIntakeMessage('BID/BOD clinical assessment recorded. Follow the facility disposition workflow.');
            };
            return <div className="p-6 space-y-6 animate-fade-in">
                <div><h2 className="text-2xl font-bold text-slate-900">Clinical Workflows</h2><p className="text-slate-500 mt-1">Encounter coordination, emergency intake, immunization, and medication-administration records.</p></div>
                <Tabs tabs={isRegistrationOnly ? [{ id: 'encounters', label: 'Encounter Registration' }] : [{ id: 'encounters', label: 'Encounters' }, { id: 'immunizations', label: 'Immunizations' }, { id: 'mar', label: 'Medication Administration' }]} activeTab={tab} onChange={setTab} />
                {tab === 'encounters' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><Card title="Register encounter"><div className="space-y-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unknownIdentity} onChange={(event) => {setUnknownIdentity(event.target.checked);setEncounterForm((form) => ({...form,caseType:event.target.checked ? 'emergency' : form.caseType}));}} /> Unidentified emergency patient</label><Select label="Patient" disabled={unknownIdentity} value={encounterForm.patientId} onChange={(event) => setEncounterForm({ ...encounterForm, patientId: event.target.value })} options={patientOptions} /><Select label="Encounter type" value={encounterForm.encounterType} onChange={(event) => setEncounterForm({ ...encounterForm, encounterType: event.target.value })} options={['outpatient','emergency','inpatient','telehealth','home_visit'].map((value) => ({ value, label: value.replace('_', ' ') }))} /><Select label="Registration pathway" value={encounterForm.caseType} onChange={(event) => setEncounterForm({ ...encounterForm, caseType: event.target.value })} options={[{value:'routine',label:'Routine'}, {value:'emergency',label:'Emergency'}, {value:'bid',label:'Brought In Dead (BID/BOD)'}]} />{(encounterForm.caseType === 'emergency' || encounterForm.encounterType === 'emergency') && <><Input label="Arrival mode" value={encounterForm.arrivalMode} onChange={(event) => setEncounterForm({ ...encounterForm, arrivalMode: event.target.value })} /><Select label="Triage priority" value={encounterForm.triagePriority} onChange={(event) => setEncounterForm({ ...encounterForm, triagePriority: event.target.value })} options={['routine','urgent','emergency','immediate'].map((value) => ({value,label:value}))} /><Input label="Presenting emergency" value={encounterForm.presentingEmergency} onChange={(event) => setEncounterForm({ ...encounterForm, presentingEmergency: event.target.value })} /><Input label="Accompanying person" value={encounterForm.accompanyingPerson} onChange={(event) => setEncounterForm({ ...encounterForm, accompanyingPerson: event.target.value })} /></>}{encounterForm.caseType === 'bid' && <><Input label="Source of referral" value={encounterForm.referralSource} onChange={(event) => setEncounterForm({ ...encounterForm, referralSource: event.target.value })} /><Input label="Accompanying person" value={encounterForm.accompanyingPerson} onChange={(event) => setEncounterForm({ ...encounterForm, accompanyingPerson: event.target.value })} /><p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Registration records a reported case only. An authorized clinician must document the assessment and disposition.</p></>}<Input label="Location" value={encounterForm.location} onChange={(event) => setEncounterForm({ ...encounterForm, location: event.target.value })} /><TextArea label="Presenting complaint / circumstances" value={encounterForm.reason} onChange={(event) => setEncounterForm({ ...encounterForm, reason: event.target.value })} />{intakeMessage && <p className="text-sm text-slate-700" role="status">{intakeMessage}</p>}<Button variant="primary" className="w-full justify-center" onClick={saveEncounter}>Register encounter</Button></div></Card><Card title="Active and recent encounters" className="lg:col-span-2"><DataTable columns={[{ key: 'patientId', title: 'Patient', render: (row) => patientName(row.patientId) }, { key: 'encounterType', title: 'Type' }, { key: 'reasonForVisit', title: 'Reason' }, { key: 'startedAt', title: 'Started', render: (row) => formatDateTime(row.startedAt) }, { key: 'status', title: 'Status', render:(row) => row.case_type === 'bid' || row.caseType === 'bid' ? `BID/BOD: ${row.death_assessment_status || row.deathAssessmentStatus || 'assessment required'}` : row.status }]} data={encounters} actions={(row) => (row.case_type === 'bid' || row.caseType === 'bid') && ['doctor','super_admin'].includes(user?.role) ? <Button size="sm" variant="danger" onClick={() => {setBidEncounter(row);setBidForm({status:row.death_assessment_status || 'under_assessment',notes:row.death_assessment_notes || '',disposition:row.disposition || ''});}}>Doctor assessment</Button> : row.status === 'in_progress' && !isRegistrationOnly ? <Button size="sm" onClick={() => completeEncounter(row)}>Complete</Button> : null} /></Card></div>}
                <Modal isOpen={!!bidEncounter} onClose={() => setBidEncounter(null)} title="Authorized BID/BOD assessment" size="lg" footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setBidEncounter(null)}>Cancel</Button><Button variant="danger" onClick={saveBidAssessment}>Save assessment</Button></div>}><div className="space-y-4"><p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Reported status on arrival is not a clinical determination. Record the examination and case disposition.</p><Select label="Clinical determination" value={bidForm.status} onChange={(event) => setBidForm((form) => ({...form,status:event.target.value}))} options={[{value:'under_assessment',label:'Under assessment'},{value:'death_confirmed',label:'Death confirmed by clinician'},{value:'not_confirmed',label:'Death not confirmed'},{value:'further_assessment',label:'Further assessment required'}]} /><TextArea label="Clinical examination and documentation" value={bidForm.notes} onChange={(event) => setBidForm((form) => ({...form,notes:event.target.value}))} rows={5} /><TextArea label="Disposition per facility policy" value={bidForm.disposition} onChange={(event) => setBidForm((form) => ({...form,disposition:event.target.value}))} rows={3}/>{intakeMessage && <p role="alert" className="text-sm text-red-700">{intakeMessage}</p>}</div></Modal>
                {tab === 'immunizations' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><Card title="Record immunization"><div className="space-y-3"><Select label="Patient" value={immunizationForm.patientId} onChange={(event) => setImmunizationForm({ ...immunizationForm, patientId: event.target.value })} options={patientOptions} /><Input label="Vaccine" value={immunizationForm.vaccine} onChange={(event) => setImmunizationForm({ ...immunizationForm, vaccine: event.target.value })} /><Input label="Administered date" type="date" value={immunizationForm.administeredDate} onChange={(event) => setImmunizationForm({ ...immunizationForm, administeredDate: event.target.value })} /><Input label="Next due date" type="date" value={immunizationForm.nextDueDate} onChange={(event) => setImmunizationForm({ ...immunizationForm, nextDueDate: event.target.value })} /><TextArea label="Notes" value={immunizationForm.notes} onChange={(event) => setImmunizationForm({ ...immunizationForm, notes: event.target.value })} /><Button variant="primary" className="w-full justify-center" onClick={saveImmunization}>Record immunization</Button></div></Card><Card title="Immunization history" className="lg:col-span-2"><DataTable columns={[{ key: 'patientId', title: 'Patient', render: (row) => patientName(row.patientId) }, { key: 'vaccine', title: 'Vaccine' }, { key: 'administeredDate', title: 'Administered', render: (row) => formatDate(row.administeredDate) }, { key: 'nextDueDate', title: 'Next due', render: (row) => formatDate(row.nextDueDate) }, { key: 'status', title: 'Status' }]} data={immunizations} /></Card></div>}
                {tab === 'mar' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><Card title="Record administration"><div className="space-y-3"><Select label="Patient" value={administrationForm.patientId} onChange={(event) => setAdministrationForm({ patientId: event.target.value, prescriptionItemId: '', dosage: '', notes: '' })} options={patientOptions} /><Select label="Prescribed medication" value={administrationForm.prescriptionItemId} onChange={(event) => { const item = prescribedMedicationItems.find((row) => row.id === event.target.value); setAdministrationForm((form) => ({...form,prescriptionItemId:event.target.value,dosage:item ? `${item.dose} ${item.dose_unit}` : ''})); }} options={[{value:'',label:prescribedMedicationItems.length ? 'Select prescription item...' : 'No active or dispensed prescription items'},...prescribedMedicationItems.map((item) => ({value:item.id,label:`${item.formulary_items?.generic_name || 'Medication'} · ${item.formulary_items?.strength || ''} · ${item.dose} ${item.dose_unit} ${item.route}`}))]} /><Input label="Dose administered" value={administrationForm.dosage} onChange={(event) => setAdministrationForm({ ...administrationForm, dosage: event.target.value })} /><TextArea label="Notes" value={administrationForm.notes} onChange={(event) => setAdministrationForm({ ...administrationForm, notes: event.target.value })} /><Button variant="primary" className="w-full justify-center" onClick={saveAdministration}>Record administration</Button></div></Card><Card title="Medication administration record" className="lg:col-span-2"><DataTable columns={[{ key: 'patientId', title: 'Patient', render: (row) => patientName(row.patientId) }, { key: 'medicationName', title: 'Medication' }, { key: 'dosage', title: 'Dose' }, { key: 'administeredAt', title: 'Administered', render: (row) => formatDateTime(row.administeredAt) }]} data={administrations} /></Card></div>}
            </div>;
        };

        const DocumentsModule = () => {
            const [documents, setDocuments] = useState(getLiveStore().documents || []);
            const [patientId, setPatientId] = useState('');
            const [documentType, setDocumentType] = useState('Clinical Note');
            const [uploadError, setUploadError] = useState('');

            const handleUpload = async (event) => {
                const file = event.target.files && event.target.files[0];
                if (!file || !patientId) { setUploadError('Select a patient before uploading a document.'); return; }
                setUploadError('');
                const { data, error } = await window.OneMedSupabase.uploadPatientDocument(patientId, file, documentType);
                if (error || !data) { setUploadError(error?.message || 'Upload failed.'); return; }
                const next = [normalizeDocuments([data])[0], ...documents];
                appData.documents = next;
                setDocuments(next);
                event.target.value = '';
            };

            const openDocument = async (document) => {
                const { data, error } = await window.OneMedSupabase.createDocumentUrl(document.fileUrl);
                if (error || !data?.signedUrl) { setUploadError(error?.message || 'Unable to open the document.'); return; }
                window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Clinical Documents</h2>
                            <p className="text-slate-500 mt-1">Upload scans, consent forms, reports, and patient records</p>
                        </div>
                        <label className="cursor-pointer">
                            <input type="file" className="hidden" onChange={handleUpload} />
                            <span className="inline-flex items-center gap-2 rounded-lg bg-medical-600 px-4 py-2 text-sm font-medium text-white">
                                <Icons.Upload size={16} /> Upload Document
                            </span>
                        </label>
                    </div>

                    <Card>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Select label="Patient" value={patientId} onChange={(e) => setPatientId(e.target.value)} options={[{ value: '', label: 'Select patient...' }, ...(getLiveStore().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Select label="Document type" value={documentType} onChange={(e) => setDocumentType(e.target.value)} options={['Clinical Note', 'Consent', 'Laboratory', 'Radiology', 'Discharge Summary', 'Referral'].map(value => ({ value, label: value }))} />
                            {uploadError && <p className="self-end text-sm text-red-600">{uploadError}</p>}
                        </div>
                    </Card>

                    <Card>
                        <DataTable
                            columns={[
                                { key: 'fileName', title: 'File Name' },
                                { key: 'documentType', title: 'Type' },
                                { key: 'uploadedBy', title: 'Uploaded By' },
                                { key: 'size', title: 'Size' },
                                { key: 'uploadedAt', title: 'Uploaded', render: (row) => formatDateTime(row.uploadedAt) }
                            ]}
                            data={documents}
                            actions={(row) => (
                                <Button variant="ghost" size="sm" icon={Icons.Eye} onClick={() => openDocument(row)}>Open</Button>
                            )}
                        />
                    </Card>
                </div>
            );
        };
