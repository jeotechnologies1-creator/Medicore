        const ConsultationsModule = () => {
            const [consultations, setConsultations] = useState(getLiveStore().consultations || []);
            const [form, setForm] = useState({ patientId: '', doctorId: '', chiefComplaint: '', diagnosis: '', assessment: '', plan: '', followUpDate: '' });

            const handleSaveConsultation = async () => {
                if (!form.patientId || !form.chiefComplaint) return;
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) return;
                const { data, error } = await client.from('consultations').insert({
                    patient_id: form.patientId, doctor_id: form.doctorId || null, chief_complaint: form.chiefComplaint,
                    diagnosis: form.diagnosis || null, assessment: form.assessment || null, plan: form.plan || null,
                    follow_up_date: form.followUpDate || null, status: 'completed'
                }).select();
                if (error || !data?.[0]) return;
                const next = [normalizeConsultations(data)[0], ...consultations];
                appData.consultations = next;
                setConsultations(next);
                setForm({ patientId: '', doctorId: '', chiefComplaint: '', diagnosis: '', assessment: '', plan: '', followUpDate: '' });
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Consultation Notes</h2>
                            <p className="text-slate-500 mt-1">Record patient assessments, diagnosis, and follow-up care plans</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus}>New Encounter</Button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card title="New Consultation" className="lg:col-span-2">
                            <div className="space-y-4">
                                <Select label="Patient" value={form.patientId} onChange={(e) => setForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(getLiveStore().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                                <Select label="Clinician" value={form.doctorId} onChange={(e) => setForm(prev => ({ ...prev, doctorId: e.target.value }))} options={[{ value: '', label: 'Unassigned' }, ...(getLiveStore().users || []).filter(u => u.role === 'doctor').map(u => ({ value: u.id, label: u.name }))]} />
                                <Input label="Chief Complaint" value={form.chiefComplaint} onChange={(e) => setForm(prev => ({ ...prev, chiefComplaint: e.target.value }))} />
                                <Input label="Diagnosis" value={form.diagnosis} onChange={(e) => setForm(prev => ({ ...prev, diagnosis: e.target.value }))} />
                                <TextArea label="Assessment" value={form.assessment} onChange={(e) => setForm(prev => ({ ...prev, assessment: e.target.value }))} rows={3} />
                                <TextArea label="Plan / Treatment" value={form.plan} onChange={(e) => setForm(prev => ({ ...prev, plan: e.target.value }))} rows={3} />
                                <Input label="Follow-up Date" type="date" value={form.followUpDate} onChange={(e) => setForm(prev => ({ ...prev, followUpDate: e.target.value }))} />
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
            const [vitals, setVitals] = useState(getLiveStore().vitals || []);
            const [form, setForm] = useState({ patientId: '', temperature: '', heartRate: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', oxygenSaturation: '', respiratoryRate: '', painScore: '0' });

            const handleSaveVitals = async () => {
                if (!form.patientId) return;
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) return;
                const numericOrNull = (value) => value === '' ? null : Number(value);
                const { data, error } = await client.from('vital_signs').insert({
                    patient_id: form.patientId, temperature: numericOrNull(form.temperature), heart_rate: numericOrNull(form.heartRate),
                    blood_pressure_systolic: numericOrNull(form.bloodPressureSystolic), blood_pressure_diastolic: numericOrNull(form.bloodPressureDiastolic),
                    oxygen_saturation: numericOrNull(form.oxygenSaturation), respiratory_rate: numericOrNull(form.respiratoryRate),
                    pain_score: numericOrNull(form.painScore), consciousness: 'Alert'
                }).select();
                if (error || !data?.[0]) return;
                const next = [normalizeVitals(data)[0], ...vitals];
                appData.vitals = next;
                setVitals(next);
                setForm({ patientId: '', temperature: '', heartRate: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', oxygenSaturation: '', respiratoryRate: '', painScore: '0' });
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
                                </div>
                                <Input label="Pain Score (0-10)" value={form.painScore} onChange={(e) => setForm(prev => ({ ...prev, painScore: e.target.value }))} />
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
            const [allergies, setAllergies] = useState(getLiveStore().allergies || []);
            const [conditions, setConditions] = useState(getLiveStore().conditions || []);
            const [carePlans, setCarePlans] = useState(getLiveStore().carePlans || []);
            const [alerts, setAlerts] = useState(getLiveStore().clinicalAlerts || []);
            const [allergyForm, setAllergyForm] = useState({ patientId: '', substance: '', reaction: '', severity: 'moderate', criticality: 'low' });
            const [conditionForm, setConditionForm] = useState({ patientId: '', conditionName: '', onsetDate: '' });
            const [carePlanForm, setCarePlanForm] = useState({ patientId: '', title: '', description: '', targetDate: '' });
            const patients = getLiveStore().patients || [];

            const save = async (table, payload, setter, appTable, mapper) => {
                const client = window.MedicoreSupabase?.getClient?.();
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
                    patient_id: allergyForm.patientId, substance: allergyForm.substance, reaction: allergyForm.reaction,
                    severity: allergyForm.severity, criticality: allergyForm.criticality, category: 'medication', clinical_status: 'active'
                }, setAllergies, 'allergies', normalizeAllergies);
                if (saved) setAllergyForm({ patientId: '', substance: '', reaction: '', severity: 'moderate', criticality: 'low' });
            };
            const addCondition = async () => {
                if (!conditionForm.patientId || !conditionForm.conditionName) return;
                const saved = await save('patient_conditions', {
                    patient_id: conditionForm.patientId, condition_name: conditionForm.conditionName,
                    onset_date: conditionForm.onsetDate || null, clinical_status: 'active', verification_status: 'provisional'
                }, setConditions, 'conditions', normalizeConditions);
                if (saved) setConditionForm({ patientId: '', conditionName: '', onsetDate: '' });
            };
            const addCarePlan = async () => {
                if (!carePlanForm.patientId || !carePlanForm.title) return;
                const saved = await save('care_plans', {
                    patient_id: carePlanForm.patientId, title: carePlanForm.title, description: carePlanForm.description,
                    target_date: carePlanForm.targetDate || null, status: 'active'
                }, setCarePlans, 'carePlans', normalizeCarePlans);
                if (saved) setCarePlanForm({ patientId: '', title: '', description: '', targetDate: '' });
            };

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
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <Card title="Record allergy / intolerance">
                            <div className="space-y-3">
                                <Select label="Patient" value={allergyForm.patientId} onChange={(e) => setAllergyForm({ ...allergyForm, patientId: e.target.value })} options={patientOptions} />
                                <Input label="Allergen or substance" value={allergyForm.substance} onChange={(e) => setAllergyForm({ ...allergyForm, substance: e.target.value })} />
                                <Input label="Reaction" value={allergyForm.reaction} onChange={(e) => setAllergyForm({ ...allergyForm, reaction: e.target.value })} />
                                <Select label="Severity" value={allergyForm.severity} onChange={(e) => setAllergyForm({ ...allergyForm, severity: e.target.value })} options={['mild','moderate','severe'].map(value => ({ value, label: value }))} />
                                <Button variant="primary" className="w-full justify-center" icon={Icons.Save} onClick={addAllergy}>Save Allergy</Button>
                            </div>
                        </Card>
                        <Card title="Add problem to list">
                            <div className="space-y-3">
                                <Select label="Patient" value={conditionForm.patientId} onChange={(e) => setConditionForm({ ...conditionForm, patientId: e.target.value })} options={patientOptions} />
                                <Input label="Condition" value={conditionForm.conditionName} onChange={(e) => setConditionForm({ ...conditionForm, conditionName: e.target.value })} />
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
            const [inventory, setInventory] = useState(getLiveStore().pharmacyInventory || []);
            const [search, setSearch] = useState('');

            const filtered = (inventory || []).filter(item => ((item.name || '') + (item.category || '')).toLowerCase().includes(search.toLowerCase()));

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Inventory & Stock Control</h2>
                            <p className="text-slate-500 mt-1">Monitor stock levels, expiry dates, and reorder alerts</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus}>Add Item</Button>
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
                </div>
            );
        };

        const ClinicalWorkflowsModule = () => {
            const { user } = useAuth();
            const [tab, setTab] = useState('encounters');
            const [encounters, setEncounters] = useState(getLiveStore().encounters || []);
            const [immunizations, setImmunizations] = useState(getLiveStore().immunizations || []);
            const [administrations, setAdministrations] = useState(getLiveStore().medicationAdministrations || []);
            const [encounterForm, setEncounterForm] = useState({ patientId: '', encounterType: 'outpatient', location: '', reason: '' });
            const [immunizationForm, setImmunizationForm] = useState({ patientId: '', vaccine: '', administeredDate: new Date().toISOString().slice(0, 10), nextDueDate: '', notes: '' });
            const [administrationForm, setAdministrationForm] = useState({ patientId: '', medicationName: '', dosage: '', notes: '' });
            const patients = getLiveStore().patients || [];
            const patientOptions = [{ value: '', label: 'Select patient...' }, ...patients.map((patient) => ({ value: patient.id, label: `${patient.firstName} ${patient.lastName}` }))];
            const patientName = (id) => {
                const patient = patients.find((item) => item.id === id);
                return patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown';
            };

            const saveEncounter = async () => {
                if (!encounterForm.patientId || !encounterForm.reason.trim()) return;
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('start encounter');
                const { data, error } = await client.from('encounters').insert({ patient_id: encounterForm.patientId, attending_clinician_id: user?.id || null, encounter_type: encounterForm.encounterType, location: encounterForm.location || null, reason_for_visit: encounterForm.reason.trim(), status: 'in_progress' }).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('start encounter', error);
                const next = [normalizeEncounters(data)[0], ...encounters];
                persistStoreTable('encounters', next); setEncounters(next);
                setEncounterForm({ patientId: '', encounterType: 'outpatient', location: '', reason: '' });
            };
            const saveImmunization = async () => {
                if (!immunizationForm.patientId || !immunizationForm.vaccine.trim()) return;
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('record immunization');
                const { data, error } = await client.from('immunizations').insert({ patient_id: immunizationForm.patientId, vaccine: immunizationForm.vaccine.trim(), status: 'administered', administered_date: immunizationForm.administeredDate || null, next_due_date: immunizationForm.nextDueDate || null, notes: immunizationForm.notes || null }).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('record immunization', error);
                const next = [normalizeImmunizations(data)[0], ...immunizations];
                persistStoreTable('immunizations', next); setImmunizations(next);
                setImmunizationForm({ patientId: '', vaccine: '', administeredDate: new Date().toISOString().slice(0, 10), nextDueDate: '', notes: '' });
            };
            const saveAdministration = async () => {
                if (!administrationForm.patientId || !administrationForm.medicationName.trim()) return;
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('record medication administration');
                const { data, error } = await client.from('medication_administrations').insert({ patient_id: administrationForm.patientId, medication_name: administrationForm.medicationName.trim(), dosage: administrationForm.dosage || null, administered_by: user?.id || null, notes: administrationForm.notes || null }).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('record medication administration', error);
                const next = [normalizeMedicationAdministrations(data)[0], ...administrations];
                persistStoreTable('medicationAdministrations', next); setAdministrations(next);
                setAdministrationForm({ patientId: '', medicationName: '', dosage: '', notes: '' });
            };
            const completeEncounter = async (encounter) => {
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('complete encounter');
                const { data, error } = await client.from('encounters').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', encounter.id).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('complete encounter', error);
                const updated = normalizeEncounters(data)[0]; const next = encounters.map((item) => item.id === updated.id ? updated : item);
                persistStoreTable('encounters', next); setEncounters(next);
            };
            return <div className="p-6 space-y-6 animate-fade-in">
                <div><h2 className="text-2xl font-bold text-slate-900">Clinical Workflows</h2><p className="text-slate-500 mt-1">Live encounter, immunization, and medication-administration records.</p></div>
                <Tabs tabs={[{ id: 'encounters', label: 'Encounters' }, { id: 'immunizations', label: 'Immunizations' }, { id: 'mar', label: 'Medication Administration' }]} activeTab={tab} onChange={setTab} />
                {tab === 'encounters' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><Card title="Start encounter"><div className="space-y-3"><Select label="Patient" value={encounterForm.patientId} onChange={(event) => setEncounterForm({ ...encounterForm, patientId: event.target.value })} options={patientOptions} /><Select label="Type" value={encounterForm.encounterType} onChange={(event) => setEncounterForm({ ...encounterForm, encounterType: event.target.value })} options={['outpatient','emergency','inpatient','telehealth','home_visit'].map((value) => ({ value, label: value.replace('_', ' ') }))} /><Input label="Location" value={encounterForm.location} onChange={(event) => setEncounterForm({ ...encounterForm, location: event.target.value })} /><TextArea label="Reason for visit" value={encounterForm.reason} onChange={(event) => setEncounterForm({ ...encounterForm, reason: event.target.value })} /><Button variant="primary" className="w-full justify-center" onClick={saveEncounter}>Start encounter</Button></div></Card><Card title="Active and recent encounters" className="lg:col-span-2"><DataTable columns={[{ key: 'patientId', title: 'Patient', render: (row) => patientName(row.patientId) }, { key: 'encounterType', title: 'Type' }, { key: 'reasonForVisit', title: 'Reason' }, { key: 'startedAt', title: 'Started', render: (row) => formatDateTime(row.startedAt) }, { key: 'status', title: 'Status' }]} data={encounters} actions={(row) => row.status === 'in_progress' ? <Button size="sm" onClick={() => completeEncounter(row)}>Complete</Button> : null} /></Card></div>}
                {tab === 'immunizations' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><Card title="Record immunization"><div className="space-y-3"><Select label="Patient" value={immunizationForm.patientId} onChange={(event) => setImmunizationForm({ ...immunizationForm, patientId: event.target.value })} options={patientOptions} /><Input label="Vaccine" value={immunizationForm.vaccine} onChange={(event) => setImmunizationForm({ ...immunizationForm, vaccine: event.target.value })} /><Input label="Administered date" type="date" value={immunizationForm.administeredDate} onChange={(event) => setImmunizationForm({ ...immunizationForm, administeredDate: event.target.value })} /><Input label="Next due date" type="date" value={immunizationForm.nextDueDate} onChange={(event) => setImmunizationForm({ ...immunizationForm, nextDueDate: event.target.value })} /><TextArea label="Notes" value={immunizationForm.notes} onChange={(event) => setImmunizationForm({ ...immunizationForm, notes: event.target.value })} /><Button variant="primary" className="w-full justify-center" onClick={saveImmunization}>Record immunization</Button></div></Card><Card title="Immunization history" className="lg:col-span-2"><DataTable columns={[{ key: 'patientId', title: 'Patient', render: (row) => patientName(row.patientId) }, { key: 'vaccine', title: 'Vaccine' }, { key: 'administeredDate', title: 'Administered', render: (row) => formatDate(row.administeredDate) }, { key: 'nextDueDate', title: 'Next due', render: (row) => formatDate(row.nextDueDate) }, { key: 'status', title: 'Status' }]} data={immunizations} /></Card></div>}
                {tab === 'mar' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><Card title="Record administration"><div className="space-y-3"><Select label="Patient" value={administrationForm.patientId} onChange={(event) => setAdministrationForm({ ...administrationForm, patientId: event.target.value })} options={patientOptions} /><Input label="Medication" value={administrationForm.medicationName} onChange={(event) => setAdministrationForm({ ...administrationForm, medicationName: event.target.value })} /><Input label="Dose administered" value={administrationForm.dosage} onChange={(event) => setAdministrationForm({ ...administrationForm, dosage: event.target.value })} /><TextArea label="Notes" value={administrationForm.notes} onChange={(event) => setAdministrationForm({ ...administrationForm, notes: event.target.value })} /><Button variant="primary" className="w-full justify-center" onClick={saveAdministration}>Record administration</Button></div></Card><Card title="Medication administration record" className="lg:col-span-2"><DataTable columns={[{ key: 'patientId', title: 'Patient', render: (row) => patientName(row.patientId) }, { key: 'medicationName', title: 'Medication' }, { key: 'dosage', title: 'Dose' }, { key: 'administeredAt', title: 'Administered', render: (row) => formatDateTime(row.administeredAt) }]} data={administrations} /></Card></div>}
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
                const { data, error } = await window.MedicoreSupabase.uploadPatientDocument(patientId, file, documentType);
                if (error || !data) { setUploadError(error?.message || 'Upload failed.'); return; }
                const next = [normalizeDocuments([data])[0], ...documents];
                appData.documents = next;
                setDocuments(next);
                event.target.value = '';
            };

            const openDocument = async (document) => {
                const { data, error } = await window.MedicoreSupabase.createDocumentUrl(document.fileUrl);
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
