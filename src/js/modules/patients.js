        // ==========================================
        // PATIENTS MODULE
        // ==========================================
        const PatientsModule = () => {
            const [searchQuery, setSearchQuery] = useState('');
            const [selectedPatient, setSelectedPatient] = useState(null);
            const [showRegistration, setShowRegistration] = useState(false);
            const [activeTab, setActiveTab] = useState('overview');
            const [filterStatus, setFilterStatus] = useState('all');
            const [patients, setPatients] = useState((hydrateSeedData().patients || []));
            const [form, setForm] = useState({
                firstName: '',
                lastName: '',
                dateOfBirth: '',
                gender: '',
                phone: '',
                email: '',
                address: '',
                bloodGroup: '',
                emergencyContactName: '',
                emergencyContactPhone: ''
            });

            const filteredPatients = useMemo(() => {
                let filtered = patients || [];
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    filtered = filtered.filter(p => 
                        (p.firstName || '').toLowerCase().includes(q) ||
                        (p.lastName || '').toLowerCase().includes(q) ||
                        (p.patientNumber || '').toLowerCase().includes(q) ||
                        (p.phone || '').includes(q)
                    );
                }
                if (filterStatus !== 'all') {
                    filtered = filtered.filter(p => p.status === filterStatus);
                }
                return filtered;
            }, [patients, searchQuery, filterStatus]);

            const handleRegisterPatient = async () => {
                const payload = {
                    patient_number: `P-${new Date().getFullYear()}-${String((patients?.length || 0) + 1).padStart(4, '0')}`,
                    first_name: form.firstName,
                    last_name: form.lastName,
                    date_of_birth: form.dateOfBirth,
                    gender: form.gender,
                    phone: form.phone,
                    email: form.email || `${form.firstName.toLowerCase()}.${form.lastName.toLowerCase()}@medicore.local`,
                    address: form.address,
                    blood_group: form.bloodGroup,
                    emergency_contact_name: form.emergencyContactName,
                    emergency_contact_phone: form.emergencyContactPhone,
                    registration_date: new Date().toISOString().split('T')[0],
                    status: 'active',
                    allergies: 'None',
                    chronic_conditions: 'None'
                };

                if (!payload.first_name || !payload.last_name || !payload.date_of_birth || !payload.phone) {
                    return;
                }

                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                let created = null;
                if (client) {
                    const { data, error } = await client.from('patients').insert([payload]).select();
                    if (!error && data && data[0]) created = data[0];
                }
                if (!created) {
                    const id = 'p' + Date.now();
                    created = { ...payload, id, patientNumber: payload.patient_number, firstName: payload.first_name, lastName: payload.last_name, dateOfBirth: payload.date_of_birth, bloodGroup: payload.blood_group, emergencyContact: { name: payload.emergency_contact_name, phone: payload.emergency_contact_phone }, insurance: { provider: 'Not Provided', policyNumber: 'N/A' }, createdAt: new Date().toISOString() };
                    persistSeedTable('patients', [...patients, created]);
                    setPatients([...patients, created]);
                } else {
                    const mapped = {
                        ...created,
                        id: created.id,
                        patientNumber: created.patient_number || created.patientNumber,
                        firstName: created.first_name || created.firstName,
                        lastName: created.last_name || created.lastName,
                        dateOfBirth: created.date_of_birth || created.dateOfBirth,
                        bloodGroup: created.blood_group || created.bloodGroup,
                        emergencyContact: { name: created.emergency_contact_name || '', phone: created.emergency_contact_phone || '' },
                        insurance: { provider: created.insurance_provider || 'Not Provided', policyNumber: created.insurance_policy_number || 'N/A' },
                        registrationDate: created.registration_date || created.registrationDate || new Date().toISOString().split('T')[0]
                    };
                    const nextPatients = [...patients, mapped];
                    persistSeedTable('patients', nextPatients);
                    setPatients(nextPatients);
                }
                setForm({ firstName: '', lastName: '', dateOfBirth: '', gender: '', phone: '', email: '', address: '', bloodGroup: '', emergencyContactName: '', emergencyContactPhone: '' });
                setShowRegistration(false);
            };

            const handlePatientClick = (patient) => {
                setSelectedPatient(patient);
                setActiveTab('overview');
            };

            const PatientDetailView = ({ patient }) => {
                const patientAppointments = seedData.appointments.filter(a => a.patientId === patient.id);
                const patientLabs = seedData.labOrders.filter(l => l.patientId === patient.id);
                const patientPrescriptions = seedData.prescriptions.filter(p => p.patientId === patient.id);
                const patientVitals = seedData.vitals.filter(v => v.patientId === patient.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                const patientBilling = seedData.billing.filter(b => b.patientId === patient.id);
                const patientAdmissions = seedData.admissions.filter(a => a.patientId === patient.id);
                const patientAllergies = (seedData.allergies || []).filter(a => a.patientId === patient.id);
                const patientConditions = (seedData.conditions || []).filter(c => c.patientId === patient.id);
                const patientMedicationOrders = (seedData.medicationOrders || []).filter(m => m.patientId === patient.id);
                const patientCarePlans = (seedData.carePlans || []).filter(c => c.patientId === patient.id);
                const encounterNotes = (seedData.consultations || []).filter(c => c.patientId === patient.id);
                const [medicationForm, setMedicationForm] = useState({
                    medicationName: '',
                    dose: '',
                    doseUnit: 'mg',
                    route: 'oral',
                    frequency: 'Daily',
                    indication: ''
                });
                const [encounterForm, setEncounterForm] = useState({
                    chiefComplaint: '',
                    diagnosis: '',
                    assessment: '',
                    plan: '',
                    followUpDate: ''
                });
                const [carePlanForm, setCarePlanForm] = useState({
                    title: '',
                    description: '',
                    targetDate: ''
                });

                const allergyMatch = medicationForm.medicationName
                    ? patientAllergies.find((allergy) => {
                        const substance = (allergy.substance || '').toLowerCase();
                        const medName = medicationForm.medicationName.toLowerCase();
                        return substance && (substance.includes(medName) || medName.includes(substance));
                    })
                    : null;

                const handleSaveMedicationOrder = () => {
                    if (!medicationForm.medicationName.trim()) return;

                    const nextOrder = {
                        id: 'med_order_' + Date.now(),
                        patientId: patient.id,
                        medicationName: medicationForm.medicationName.trim(),
                        dose: medicationForm.dose || '1',
                        doseUnit: medicationForm.doseUnit,
                        route: medicationForm.route,
                        frequency: medicationForm.frequency,
                        indication: medicationForm.indication || 'Clinical review required',
                        status: 'active'
                    };

                    const next = [nextOrder, ...(seedData.medicationOrders || [])];
                    persistSeedTable('medicationOrders', next);
                    seedData.medicationOrders = next;
                    setMedicationForm({ medicationName: '', dose: '', doseUnit: 'mg', route: 'oral', frequency: 'Daily', indication: '' });
                };

                const handleSaveEncounterNote = () => {
                    if (!encounterForm.chiefComplaint.trim()) return;

                    const nextEncounter = {
                        id: 'enc_' + Date.now(),
                        patientId: patient.id,
                        doctorId: 'u2',
                        chiefComplaint: encounterForm.chiefComplaint.trim(),
                        diagnosis: encounterForm.diagnosis.trim() || 'Assessment pending',
                        assessment: encounterForm.assessment.trim() || 'Clinical assessment recorded',
                        plan: encounterForm.plan.trim() || 'Continue monitoring',
                        followUpDate: encounterForm.followUpDate || null,
                        status: 'completed',
                        createdAt: new Date().toISOString()
                    };

                    const next = [nextEncounter, ...(seedData.consultations || [])];
                    persistSeedTable('consultations', next);
                    seedData.consultations = next;
                    setEncounterForm({ chiefComplaint: '', diagnosis: '', assessment: '', plan: '', followUpDate: '' });
                };

                const handleSaveCarePlan = () => {
                    if (!carePlanForm.title.trim()) return;

                    const nextCarePlan = {
                        id: 'care_' + Date.now(),
                        patientId: patient.id,
                        title: carePlanForm.title.trim(),
                        description: carePlanForm.description.trim() || 'Follow-up care plan',
                        targetDate: carePlanForm.targetDate || null,
                        status: 'active',
                        reviewDate: carePlanForm.targetDate || null
                    };

                    const next = [nextCarePlan, ...(seedData.carePlans || [])];
                    persistSeedTable('carePlans', next);
                    seedData.carePlans = next;
                    setCarePlanForm({ title: '', description: '', targetDate: '' });
                };

                const tabs = [
                    { id: 'overview', label: 'Overview' },
                    { id: 'chart', label: 'Clinical Chart' },
                    { id: 'visits', label: 'Visits & Appointments' },
                    { id: 'labs', label: 'Lab Results' },
                    { id: 'prescriptions', label: 'Prescriptions' },
                    { id: 'vitals', label: 'Vital Signs' },
                    { id: 'billing', label: 'Billing' },
                    { id: 'admissions', label: 'Admissions' },
                    { id: 'documents', label: 'Documents' },
                ];

                return (
                    <div className="animate-fade-in">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <Avatar name={patient.firstName + ' ' + patient.lastName} size="xl" />
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900">{patient.firstName} {patient.lastName}</h2>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-sm text-slate-500">{patient.patientNumber}</span>
                                        <Badge variant={patient.status === 'active' ? 'success' : 'default'}>{patient.status}</Badge>
                                        <span className="text-sm text-slate-500">{calculateAge(patient.dateOfBirth)} years - {patient.gender}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="secondary" icon={Icons.Printer}>Print</Button>
                                <Button variant="primary" icon={Icons.Edit}>Edit</Button>
                            </div>
                        </div>

                        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                        <div className="mt-6">
                            {activeTab === 'overview' && (
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <div className="lg:col-span-2 space-y-6">
                                        <Card title="Patient Information">
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Date of Birth</p>
                                                    <p className="text-sm font-medium text-slate-900">{formatDate(patient.dateOfBirth)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Blood Group</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.bloodGroup}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Phone</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.phone}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Email</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.email}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Address</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.address}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Registration Date</p>
                                                    <p className="text-sm font-medium text-slate-900">{formatDate(patient.registrationDate)}</p>
                                                </div>
                                            </div>
                                        </Card>

                                        <Card title="Medical Alerts">
                                            <div className="space-y-3">
                                                {patient.allergies !== 'None' && (
                                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                                                        <Icons.AlertCircle size={20} className="text-red-600 flex-shrink-0" />
                                                        <div>
                                                            <p className="text-sm font-medium text-red-800">Allergy Alert</p>
                                                            <p className="text-sm text-red-700">{patient.allergies}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                {patient.chronicConditions !== 'None' && (
                                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
                                                        <Icons.AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
                                                        <div>
                                                            <p className="text-sm font-medium text-amber-800">Chronic Conditions</p>
                                                            <p className="text-sm text-amber-700">{patient.chronicConditions}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                {patient.allergies === 'None' && patient.chronicConditions === 'None' && (
                                                    <p className="text-slate-500 text-center py-4">No active alerts</p>
                                                )}
                                            </div>
                                        </Card>

                                        <Card title="Recent Visits">
                                            <DataTable
                                                columns={[
                                                    { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                                    { key: 'type', title: 'Type' },
                                                    { key: 'department', title: 'Department' },
                                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'in-progress' ? 'info' : 'default'}>{row.status}</Badge> }
                                                ]}
                                                data={patientAppointments.slice(0, 5)}
                                            />
                                        </Card>
                                    </div>

                                    <div className="space-y-6">
                                        <Card title="Insurance Information">
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Provider</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.insurance.provider}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Policy Number</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.insurance.policyNumber}</p>
                                                </div>
                                            </div>
                                        </Card>

                                        <Card title="Emergency Contact">
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Name</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.emergencyContact.name}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Phone</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.emergencyContact.phone}</p>
                                                </div>
                                            </div>
                                        </Card>

                                        <Card title="Quick Stats">
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-slate-600">Total Visits</span>
                                                    <span className="font-medium text-slate-900">{patientAppointments.length}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-slate-600">Lab Tests</span>
                                                    <span className="font-medium text-slate-900">{patientLabs.length}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-slate-600">Prescriptions</span>
                                                    <span className="font-medium text-slate-900">{patientPrescriptions.length}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-slate-600">Admissions</span>
                                                    <span className="font-medium text-slate-900">{patientAdmissions.length}</span>
                                                </div>
                                            </div>
                                        </Card>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'chart' && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <StatCard title="Allergies" value={patientAllergies.length} icon={Icons.Shield} color="amber" subtitle="Recorded safety issues" />
                                        <StatCard title="Active problems" value={patientConditions.filter(c => c.clinicalStatus === 'active').length} icon={Icons.ClipboardList} color="medical" subtitle="Current diagnoses" />
                                        <StatCard title="Medication orders" value={patientMedicationOrders.length} icon={Icons.Pill} color="emerald" subtitle="Active treatments" />
                                        <StatCard title="Last visit" value={patientAppointments[0] ? formatDate(patientAppointments[0].date) : 'N/A'} icon={Icons.Calendar} color="violet" subtitle="Most recent encounter" />
                                    </div>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                        <Card title="Encounter documentation" subtitle="Clinical note and diagnosis capture">
                                            <div className="space-y-4">
                                                <Input label="Chief complaint" value={encounterForm.chiefComplaint} onChange={(e) => setEncounterForm(prev => ({ ...prev, chiefComplaint: e.target.value }))} />
                                                <Input label="Diagnosis" value={encounterForm.diagnosis} onChange={(e) => setEncounterForm(prev => ({ ...prev, diagnosis: e.target.value }))} />
                                                <TextArea label="Assessment" rows={3} value={encounterForm.assessment} onChange={(e) => setEncounterForm(prev => ({ ...prev, assessment: e.target.value }))} />
                                                <TextArea label="Plan / treatment" rows={3} value={encounterForm.plan} onChange={(e) => setEncounterForm(prev => ({ ...prev, plan: e.target.value }))} />
                                                <Input label="Follow-up date" type="date" value={encounterForm.followUpDate} onChange={(e) => setEncounterForm(prev => ({ ...prev, followUpDate: e.target.value }))} />
                                                <Button variant="primary" className="w-full justify-center" icon={Icons.FileText} onClick={handleSaveEncounterNote}>Save Encounter Note</Button>
                                            </div>
                                        </Card>

                                        <Card title="Medication safety" subtitle="Allergy-aware prescribing">
                                            <div className="space-y-4">
                                                <Input label="Medication name" value={medicationForm.medicationName} onChange={(e) => setMedicationForm(prev => ({ ...prev, medicationName: e.target.value }))} />
                                                <div className="grid grid-cols-2 gap-4">
                                                    <Input label="Dose" value={medicationForm.dose} onChange={(e) => setMedicationForm(prev => ({ ...prev, dose: e.target.value }))} />
                                                    <Select label="Unit" value={medicationForm.doseUnit} onChange={(e) => setMedicationForm(prev => ({ ...prev, doseUnit: e.target.value }))} options={[{ value: 'mg', label: 'mg' }, { value: 'g', label: 'g' }, { value: 'ml', label: 'ml' }, { value: 'mcg', label: 'mcg' }]} />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <Select label="Route" value={medicationForm.route} onChange={(e) => setMedicationForm(prev => ({ ...prev, route: e.target.value }))} options={[{ value: 'oral', label: 'Oral' }, { value: 'iv', label: 'IV' }, { value: 'im', label: 'IM' }, { value: 'topical', label: 'Topical' }]} />
                                                    <Select label="Frequency" value={medicationForm.frequency} onChange={(e) => setMedicationForm(prev => ({ ...prev, frequency: e.target.value }))} options={[{ value: 'Daily', label: 'Daily' }, { value: 'BD', label: 'BD' }, { value: 'TDS', label: 'TDS' }, { value: 'PRN', label: 'PRN' }]} />
                                                </div>
                                                <Input label="Indication" value={medicationForm.indication} onChange={(e) => setMedicationForm(prev => ({ ...prev, indication: e.target.value }))} />
                                                {allergyMatch && (
                                                    <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
                                                        Allergy warning: {allergyMatch.substance} has already been recorded for this patient.
                                                    </div>
                                                )}
                                                <Button variant="primary" className="w-full justify-center" icon={Icons.Pill} onClick={handleSaveMedicationOrder}>Save Medication Order</Button>
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                        <Card title="Problem list & safety summary">
                                            <div className="space-y-4">
                                                <div>
                                                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Current issues</p>
                                                    {patientConditions.length ? (
                                                        <div className="space-y-2">
                                                            {patientConditions.slice(0, 5).map((condition) => (
                                                                <div key={condition.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-sm text-slate-700">
                                                                    <div className="font-medium text-slate-900">{condition.conditionName}</div>
                                                                    <div className="text-xs text-slate-500">{condition.clinicalStatus} • {condition.onsetDate ? formatDate(condition.onsetDate) : 'No date'}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-slate-500">No active clinical problems recorded.</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Allergy list</p>
                                                    {patientAllergies.length ? (
                                                        <div className="space-y-2">
                                                            {patientAllergies.slice(0, 5).map((allergy) => (
                                                                <div key={allergy.id} className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-sm text-amber-800">
                                                                    <div className="font-medium">{allergy.substance}</div>
                                                                    <div className="text-xs text-amber-700">{allergy.reaction || 'No reaction recorded'} • {allergy.severity}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-slate-500">No allergies recorded.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </Card>

                                        <Card title="Care plan & follow-up">
                                            <div className="space-y-4">
                                                <Input label="Care plan title" value={carePlanForm.title} onChange={(e) => setCarePlanForm(prev => ({ ...prev, title: e.target.value }))} />
                                                <TextArea label="Plan details" rows={3} value={carePlanForm.description} onChange={(e) => setCarePlanForm(prev => ({ ...prev, description: e.target.value }))} />
                                                <Input label="Target date" type="date" value={carePlanForm.targetDate} onChange={(e) => setCarePlanForm(prev => ({ ...prev, targetDate: e.target.value }))} />
                                                <Button variant="primary" className="w-full justify-center" icon={Icons.CheckCircle} onClick={handleSaveCarePlan}>Save Care Plan</Button>
                                                {patientCarePlans.length ? (
                                                    <div className="space-y-2 pt-2">
                                                        {patientCarePlans.slice(0, 4).map((plan) => (
                                                            <div key={plan.id} className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-800">
                                                                <div className="font-medium">{plan.title}</div>
                                                                <div className="text-xs mt-1">{plan.description}</div>
                                                                <div className="text-[11px] mt-1 opacity-80">{plan.targetDate ? `Target: ${formatDate(plan.targetDate)}` : 'Target date not set'}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-slate-500 pt-2">No care plans recorded.</p>
                                                )}
                                            </div>
                                        </Card>
                                    </div>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                        <Card title="Recent encounter notes">
                                            <DataTable
                                                columns={[
                                                    { key: 'createdAt', title: 'Date', render: (row) => formatDateTime(row.createdAt) },
                                                    { key: 'chiefComplaint', title: 'Complaint' },
                                                    { key: 'diagnosis', title: 'Diagnosis' },
                                                    { key: 'plan', title: 'Plan' }
                                                ]}
                                                data={encounterNotes.slice(0, 6)}
                                                emptyMessage="No encounter notes recorded for this patient"
                                            />
                                        </Card>

                                        <Card title="Medication orders history">
                                            <DataTable
                                                columns={[
                                                    { key: 'medicationName', title: 'Medication' },
                                                    { key: 'dose', title: 'Dose', render: (row) => `${row.dose} ${row.doseUnit}` },
                                                    { key: 'frequency', title: 'Frequency' },
                                                    { key: 'route', title: 'Route' },
                                                    { key: 'indication', title: 'Indication' },
                                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge> }
                                                ]}
                                                data={patientMedicationOrders.slice(0, 10)}
                                                emptyMessage="No medication orders recorded for this patient"
                                            />
                                        </Card>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'vitals' && (
                                <Card title="Vital Signs History">
                                    {patientVitals.length > 0 ? (
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                {[
                                                    { label: 'Latest BP', value: patientVitals[0].bloodPressureSystolic + '/' + patientVitals[0].bloodPressureDiastolic, unit: 'mmHg' },
                                                    { label: 'Heart Rate', value: patientVitals[0].heartRate, unit: 'bpm' },
                                                    { label: 'Temperature', value: patientVitals[0].temperature, unit: 'C' },
                                                    { label: 'O2 Saturation', value: patientVitals[0].oxygenSaturation, unit: '%' },
                                                ].map(v => (
                                                    <div key={v.label} className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center">
                                                        <p className="text-xs text-slate-500 mb-1">{v.label}</p>
                                                        <p className="text-xl font-bold text-slate-900">{v.value}</p>
                                                        <p className="text-xs text-slate-400">{v.unit}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="h-64">
                                                <LineChart 
                                                    data={patientVitals.slice(0, 10).reverse().map((v, i) => ({ value: v.heartRate, label: i }))} 
                                                    width={800} 
                                                    height={250} 
                                                    color="#ef4444" 
                                                />
                                            </div>
                                            <DataTable
                                                columns={[
                                                    { key: 'timestamp', title: 'Date/Time', render: (row) => formatDateTime(row.timestamp) },
                                                    { key: 'temperature', title: 'Temp (C)' },
                                                    { key: 'heartRate', title: 'HR (bpm)' },
                                                    { key: 'bloodPressure', title: 'BP', render: (row) => row.bloodPressureSystolic + '/' + row.bloodPressureDiastolic },
                                                    { key: 'oxygenSaturation', title: 'SpO2 (%)' },
                                                    { key: 'painScore', title: 'Pain' }
                                                ]}
                                                data={patientVitals.slice(0, 20)}
                                            />
                                        </div>
                                    ) : (
                                        <p className="text-center py-8 text-slate-500">No vital signs recorded</p>
                                    )}
                                </Card>
                            )}

                            {activeTab === 'labs' && (
                                <Card title="Laboratory Results">
                                    <DataTable
                                        columns={[
                                            { key: 'testType', title: 'Test' },
                                            { key: 'category', title: 'Category' },
                                            { key: 'orderedDate', title: 'Ordered', render: (row) => formatDate(row.orderedDate) },
                                            { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'critical' ? 'danger' : row.status === 'completed' ? 'success' : 'warning'}>{row.status}</Badge> },
                                            { key: 'priority', title: 'Priority', render: (row) => <Badge variant={row.priority === 'stat' ? 'danger' : row.priority === 'urgent' ? 'warning' : 'default'}>{row.priority}</Badge> }
                                        ]}
                                        data={patientLabs}
                                        actions={(row) => (
                                            <Button variant="ghost" size="sm" icon={Icons.Eye}>View</Button>
                                        )}
                                    />
                                </Card>
                            )}

                            {activeTab === 'prescriptions' && (
                                <Card title="Prescription History">
                                    <DataTable
                                        columns={[
                                            { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                            { key: 'diagnosis', title: 'Diagnosis' },
                                            { key: 'medications', title: 'Medications', render: (row) => row.medications.map(m => m.name).join(', ') },
                                            { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : row.status === 'dispensed' ? 'info' : 'default'}>{row.status}</Badge> }
                                        ]}
                                        data={patientPrescriptions}
                                    />
                                </Card>
                            )}

                            {activeTab === 'billing' && (
                                <Card title="Billing History">
                                    <DataTable
                                        columns={[
                                            { key: 'invoiceNumber', title: 'Invoice' },
                                            { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                            { key: 'total', title: 'Total', render: (row) => formatCurrency(row.total) },
                                            { key: 'paid', title: 'Paid', render: (row) => formatCurrency(row.paid) },
                                            { key: 'balance', title: 'Balance', render: (row) => formatCurrency(row.balance) },
                                            { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'paid' ? 'success' : row.status === 'partial' ? 'warning' : row.status === 'overdue' ? 'danger' : 'default'}>{row.status}</Badge> }
                                        ]}
                                        data={patientBilling}
                                    />
                                </Card>
                            )}

                            {activeTab === 'admissions' && (
                                <Card title="Admission History">
                                    <DataTable
                                        columns={[
                                            { key: 'ward', title: 'Ward' },
                                            { key: 'bedNumber', title: 'Bed' },
                                            { key: 'admissionDate', title: 'Admitted', render: (row) => formatDate(row.admissionDate) },
                                            { key: 'dischargeDate', title: 'Discharged', render: (row) => row.dischargeDate ? formatDate(row.dischargeDate) : 'Still admitted' },
                                            { key: 'diagnosis', title: 'Diagnosis' },
                                            { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'info' : 'default'}>{row.status}</Badge> }
                                        ]}
                                        data={patientAdmissions}
                                    />
                                </Card>
                            )}

                            {activeTab === 'visits' && (
                                <Card title="Appointments & Visits">
                                    <DataTable
                                        columns={[
                                            { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                            { key: 'time', title: 'Time' },
                                            { key: 'type', title: 'Type' },
                                            { key: 'department', title: 'Department' },
                                            { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'in-progress' ? 'info' : row.status === 'cancelled' ? 'danger' : 'default'}>{row.status}</Badge> }
                                        ]}
                                        data={patientAppointments}
                                    />
                                </Card>
                            )}

                            {activeTab === 'documents' && (
                                <Card title="Patient Documents">
                                    <div className="text-center py-8">
                                        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 mb-4">
                                            <Icons.Upload size={40} className="mx-auto text-slate-400 mb-3" />
                                            <p className="text-sm text-slate-600 font-medium">Drag and drop files here</p>
                                            <p className="text-xs text-slate-400 mt-1">or click to browse</p>
                                        </div>
                                        <p className="text-slate-500">No documents uploaded yet</p>
                                    </div>
                                </Card>
                            )}
                        </div>
                    </div>
                );
            };

            return (
                <div className="p-6">
                    {selectedPatient ? (
                        <div>
                            <button
                                onClick={() => setSelectedPatient(null)}
                                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
                            >
                                <Icons.ArrowLeft size={16} /> Back to patients list
                            </button>
                            <PatientDetailView patient={selectedPatient} />
                        </div>
                    ) : (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900">Patients</h2>
                                    <p className="text-slate-500 mt-1">Manage patient records and registrations</p>
                                </div>
                                <Button variant="primary" icon={Icons.UserPlus} onClick={() => setShowRegistration(true)}>Register Patient</Button>
                            </div>

                            <Card>
                                <div className="flex flex-col md:flex-row gap-4 mb-6">
                                    <div className="flex-1">
                                        <SearchBar
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search by name, ID, or phone..."
                                        />
                                    </div>
                                    <Select
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        options={[
                                            { value: 'all', label: 'All Status' },
                                            { value: 'active', label: 'Active' },
                                            { value: 'discharged', label: 'Discharged' },
                                            { value: 'inactive', label: 'Inactive' }
                                        ]}
                                        className="w-40"
                                    />
                                </div>

                                <DataTable
                                    columns={[
                                        { key: 'patientNumber', title: 'Patient ID', className: 'font-mono text-xs' },
                                        { key: 'name', title: 'Name', render: (row) => (
                                            <div className="flex items-center gap-3">
                                                <Avatar name={row.firstName + ' ' + row.lastName} size="sm" />
                                                <div>
                                                    <p className="font-medium text-slate-900">{row.firstName} {row.lastName}</p>
                                                    <p className="text-xs text-slate-500">{row.gender} - {calculateAge(row.dateOfBirth)}y</p>
                                                </div>
                                            </div>
                                        )},
                                        { key: 'phone', title: 'Contact' },
                                        { key: 'bloodGroup', title: 'Blood Group' },
                                        { key: 'registrationDate', title: 'Registered', render: (row) => formatDate(row.registrationDate) },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge> }
                                    ]}
                                    data={filteredPatients}
                                    onRowClick={handlePatientClick}
                                    actions={(row) => (
                                        <>
                                            <Button variant="ghost" size="sm" icon={Icons.QrCode}>ID</Button>
                                            <Button variant="ghost" size="sm" icon={Icons.Printer}>Print</Button>
                                        </>
                                    )}
                                />
                            </Card>
                        </div>
                    )}

                    <Modal
                        isOpen={showRegistration}
                        onClose={() => setShowRegistration(false)}
                        title="Register New Patient"
                        size="lg"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowRegistration(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleRegisterPatient}>Register Patient</Button>
                            </div>
                        }
                    >
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="First Name" required value={form.firstName} onChange={(e) => setForm(prev => ({ ...prev, firstName: e.target.value }))} />
                            <Input label="Last Name" required value={form.lastName} onChange={(e) => setForm(prev => ({ ...prev, lastName: e.target.value }))} />
                            <Input label="Date of Birth" type="date" required value={form.dateOfBirth} onChange={(e) => setForm(prev => ({ ...prev, dateOfBirth: e.target.value }))} />
                            <Select label="Gender" required value={form.gender} onChange={(e) => setForm(prev => ({ ...prev, gender: e.target.value }))} options={[{ value: '', label: 'Select...' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} />
                            <Input label="Phone Number" required value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))} />
                            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))} />
                            <Input label="Address" className="col-span-2" value={form.address} onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))} />
                            <Select label="Blood Group" value={form.bloodGroup} onChange={(e) => setForm(prev => ({ ...prev, bloodGroup: e.target.value }))} options={[{ value: '', label: 'Select...' }, { value: 'A+', label: 'A+' }, { value: 'A-', label: 'A-' }, { value: 'B+', label: 'B+' }, { value: 'B-', label: 'B-' }, { value: 'AB+', label: 'AB+' }, { value: 'AB-', label: 'AB-' }, { value: 'O+', label: 'O+' }, { value: 'O-', label: 'O-' }]} />
                            <Input label="Emergency Contact Name" value={form.emergencyContactName} onChange={(e) => setForm(prev => ({ ...prev, emergencyContactName: e.target.value }))} />
                            <Input label="Emergency Contact Phone" value={form.emergencyContactPhone} onChange={(e) => setForm(prev => ({ ...prev, emergencyContactPhone: e.target.value }))} />
                        </div>
                    </Modal>
                </div>
            );
        };

        // ==========================================
        // APPOINTMENTS MODULE
