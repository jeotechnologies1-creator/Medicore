        const ConsultationsModule = () => {
            const [consultations, setConsultations] = useState(hydrateSeedData().consultations || []);
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
                seedData.consultations = next;
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
                                <Select label="Patient" value={form.patientId} onChange={(e) => setForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(hydrateSeedData().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                                <Select label="Clinician" value={form.doctorId} onChange={(e) => setForm(prev => ({ ...prev, doctorId: e.target.value }))} options={[{ value: '', label: 'Unassigned' }, ...(hydrateSeedData().users || []).filter(u => u.role === 'doctor').map(u => ({ value: u.id, label: u.name }))]} />
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
                                    const patient = seedData.patients.find(p => p.id === row.patientId);
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
            const [vitals, setVitals] = useState(hydrateSeedData().vitals || []);
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
                seedData.vitals = next;
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
                                <Select label="Patient" value={form.patientId} onChange={(e) => setForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(hydrateSeedData().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
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
                                    const patient = seedData.patients.find(p => p.id === row.patientId);
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
            const [allergies, setAllergies] = useState(hydrateSeedData().allergies || []);
            const [conditions, setConditions] = useState(hydrateSeedData().conditions || []);
            const [carePlans, setCarePlans] = useState(hydrateSeedData().carePlans || []);
            const [alerts, setAlerts] = useState(hydrateSeedData().clinicalAlerts || []);
            const [allergyForm, setAllergyForm] = useState({ patientId: '', substance: '', reaction: '', severity: 'moderate', criticality: 'low' });
            const [conditionForm, setConditionForm] = useState({ patientId: '', conditionName: '', onsetDate: '' });
            const [carePlanForm, setCarePlanForm] = useState({ patientId: '', title: '', description: '', targetDate: '' });
            const patients = hydrateSeedData().patients || [];

            const save = async (table, payload, setter, appTable, mapper) => {
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) return false;
                const { data, error } = await client.from(table).insert([payload]).select();
                if (error || !data?.[0]) { console.error(`Unable to save ${table}`, error); return false; }
                const record = mapper([data[0]])[0];
                const next = [record, ...(appTable === 'allergies' ? allergies : appTable === 'conditions' ? conditions : carePlans)];
                seedData[appTable] = next;
                setter(next);
                return true;
            };

            const latestVitals = (seedData.vitals || []).filter(v => Number(v.oxygenSaturation) < 90 || Number(v.bloodPressureSystolic) < 90 || Number(v.temperature) >= 39);
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
            const [inventory, setInventory] = useState(hydrateSeedData().pharmacyInventory || []);
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
                            const expiry = new Date(item.expiryDate || '2027-01-01');
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

        const DocumentsModule = () => {
            const [documents, setDocuments] = useState(hydrateSeedData().documents || []);
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
                seedData.documents = next;
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
                            <Select label="Patient" value={patientId} onChange={(e) => setPatientId(e.target.value)} options={[{ value: '', label: 'Select patient...' }, ...(hydrateSeedData().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
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
