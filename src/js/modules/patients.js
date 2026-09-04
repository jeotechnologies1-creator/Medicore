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
                    patient_number: `P-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                    first_name: form.firstName,
                    last_name: form.lastName,
                    date_of_birth: form.dateOfBirth,
                    gender: form.gender,
                    phone: form.phone,
                    email: form.email || null,
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
                if (!client) return;
                const { data, error } = await client.from('patients').insert([payload]).select();
                const created = data?.[0];
                if (!error && created) {
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
                    seedData.patients = nextPatients;
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
                const [admissionForm, setAdmissionForm] = useState({
                    ward: 'General Ward',
                    bedNumber: 'A-12',
                    diagnosis: '',
                    admissionDate: new Date().toISOString().split('T')[0],
                    acuity: 'stable'
                });
                const [dischargeForm, setDischargeForm] = useState({
                    dischargeDate: new Date().toISOString().split('T')[0],
                    summary: '',
                    followUp: '',
                    instructions: ''
                });
                const [followUpForm, setFollowUpForm] = useState({
                    clinic: 'Primary Care',
                    provider: '',
                    nextVisitDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    reason: '',
                    instructions: ''
                });
                const [referralForm, setReferralForm] = useState({
                    department: 'Cardiology',
                    provider: '',
                    urgency: 'routine',
                    transferDate: new Date().toISOString().split('T')[0],
                    reason: '',
                    notes: ''
                });
                const [outcomeForm, setOutcomeForm] = useState({
                    status: 'recovered',
                    summary: '',
                    outcomeDate: new Date().toISOString().split('T')[0],
                    dischargeInstructions: ''
                });
                const [qualityForm, setQualityForm] = useState({
                    idCheck: true,
                    allergyCheck: true,
                    consent: true,
                    medReconciliation: true,
                    dischargeEducation: true,
                    riskScore: 'Low',
                    auditNote: ''
                });
                const [careCoordinationForm, setCareCoordinationForm] = useState({
                    careCoordinator: 'Care Team',
                    dischargePlan: '',
                    plannedDischargeDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    readmissionRisk: 'Low',
                    handoffNote: ''
                });
                const [problemForm, setProblemForm] = useState({
                    conditionName: '',
                    status: 'active',
                    onsetDate: ''
                });

                const allergyMatch = medicationForm.medicationName
                    ? patientAllergies.find((allergy) => {
                        const substance = (allergy.substance || '').toLowerCase();
                        const medName = medicationForm.medicationName.toLowerCase();
                        return substance && (substance.includes(medName) || medName.includes(substance));
                    })
                    : null;

                const insertClinicalRecord = async (table, payload) => {
                    const client = window.MedicoreSupabase?.getClient?.();
                    if (!client) return null;
                    const { data, error } = await client.from(table).insert(payload).select();
                    if (error) {
                        console.error(`Unable to save ${table}:`, error.message);
                        return null;
                    }
                    return data?.[0] || null;
                };

                const handleSaveMedicationOrder = async () => {
                    if (!medicationForm.medicationName.trim()) return;
                    const saved = await insertClinicalRecord('medication_orders', {
                        patient_id: patient.id, medication_name: medicationForm.medicationName.trim(), dose: medicationForm.dose || '1',
                        dose_unit: medicationForm.doseUnit, route: medicationForm.route, frequency: medicationForm.frequency,
                        indication: medicationForm.indication || null, status: 'active'
                    });
                    if (!saved) return;
                    const next = [normalizeMedicationOrders([saved])[0], ...(seedData.medicationOrders || [])];
                    seedData.medicationOrders = next;
                    setMedicationForm({ medicationName: '', dose: '', doseUnit: 'mg', route: 'oral', frequency: 'Daily', indication: '' });
                };

                const handleSaveEncounterNote = async () => {
                    if (!encounterForm.chiefComplaint.trim()) return;
                    const saved = await insertClinicalRecord('consultations', {
                        patient_id: patient.id, chief_complaint: encounterForm.chiefComplaint.trim(), diagnosis: encounterForm.diagnosis.trim() || null,
                        assessment: encounterForm.assessment.trim() || null, plan: encounterForm.plan.trim() || null,
                        follow_up_date: encounterForm.followUpDate || null, status: 'completed'
                    });
                    if (!saved) return;
                    const next = [normalizeConsultations([saved])[0], ...(seedData.consultations || [])];
                    seedData.consultations = next;
                    setEncounterForm({ chiefComplaint: '', diagnosis: '', assessment: '', plan: '', followUpDate: '' });
                };

                const handleSaveCarePlan = async () => {
                    if (!carePlanForm.title.trim()) return;
                    const saved = await insertClinicalRecord('care_plans', {
                        patient_id: patient.id, title: carePlanForm.title.trim(), description: carePlanForm.description.trim() || null,
                        target_date: carePlanForm.targetDate || null, review_date: carePlanForm.targetDate || null, status: 'active'
                    });
                    if (!saved) return;
                    const next = [normalizeCarePlans([saved])[0], ...(seedData.carePlans || [])];
                    seedData.carePlans = next;
                    setCarePlanForm({ title: '', description: '', targetDate: '' });
                };

                const handleAddProblem = async () => {
                    if (!problemForm.conditionName.trim()) return;
                    const saved = await insertClinicalRecord('patient_conditions', {
                        patient_id: patient.id, condition_name: problemForm.conditionName.trim(), clinical_status: problemForm.status,
                        verification_status: 'provisional', onset_date: problemForm.onsetDate || null
                    });
                    if (!saved) return;
                    const next = [normalizeConditions([saved])[0], ...(seedData.conditions || [])];
                    seedData.conditions = next;
                    setProblemForm({ conditionName: '', status: 'active', onsetDate: '' });
                };

                const handleSaveAdmissionNote = () => {
                    const nextAdmission = {
                        id: 'adm_' + Date.now(),
                        patientId: patient.id,
                        ward: admissionForm.ward,
                        bedNumber: admissionForm.bedNumber,
                        admissionDate: admissionForm.admissionDate || new Date().toISOString().split('T')[0],
                        dischargeDate: null,
                        doctorId: 'u2',
                        diagnosis: admissionForm.diagnosis || 'Admission assessment pending',
                        status: 'active',
                        acuity: admissionForm.acuity || 'stable'
                    };

                    const next = [nextAdmission, ...(seedData.admissions || [])];
                    persistSeedTable('admissions', next);
                    seedData.admissions = next;
                    setAdmissionForm({
                        ward: 'General Ward',
                        bedNumber: 'A-12',
                        diagnosis: '',
                        admissionDate: new Date().toISOString().split('T')[0],
                        acuity: 'stable'
                    });
                };

                const handleSaveDischargeSummary = () => {
                    if (!dischargeForm.summary.trim() && !dischargeForm.followUp.trim() && !dischargeForm.instructions.trim()) return;

                    const updatedAdmissions = (seedData.admissions || []).map((entry) => {
                        if (entry.patientId === patient.id && entry.status === 'active') {
                            return {
                                ...entry,
                                status: 'discharged',
                                dischargeDate: dischargeForm.dischargeDate || new Date().toISOString().split('T')[0],
                                diagnosis: entry.diagnosis || dischargeForm.summary || 'Discharge follow-up planned'
                            };
                        }
                        return entry;
                    });

                    persistSeedTable('admissions', updatedAdmissions);
                    seedData.admissions = updatedAdmissions;

                    const summaryDocument = {
                        id: 'doc_' + Date.now(),
                        patientId: patient.id,
                        fileName: `Discharge Summary - ${patient.patientNumber}`,
                        documentType: 'Discharge Summary',
                        fileUrl: '',
                        uploadedBy: 'Clinical Team',
                        uploadedAt: new Date().toISOString(),
                        size: '1.2 KB',
                        summary: dischargeForm.summary,
                        followUp: dischargeForm.followUp,
                        instructions: dischargeForm.instructions
                    };

                    const nextDocuments = [summaryDocument, ...(seedData.documents || [])];
                    persistSeedTable('documents', nextDocuments);
                    seedData.documents = nextDocuments;

                    setDischargeForm({
                        dischargeDate: new Date().toISOString().split('T')[0],
                        summary: '',
                        followUp: '',
                        instructions: ''
                    });
                };

                const handleSaveFollowUp = () => {
                    if (!followUpForm.reason.trim()) return;

                    const nextFollowUp = {
                        id: 'fup_' + Date.now(),
                        patientId: patient.id,
                        type: 'Follow-up',
                        department: followUpForm.clinic,
                        doctorId: 'u2',
                        date: followUpForm.nextVisitDate,
                        time: '09:00',
                        status: 'scheduled',
                        notes: followUpForm.reason.trim(),
                        createdAt: new Date().toISOString()
                    };

                    const nextAppointments = [nextFollowUp, ...(seedData.appointments || [])];
                    persistSeedTable('appointments', nextAppointments);
                    seedData.appointments = nextAppointments;

                    setFollowUpForm({
                        clinic: 'Primary Care',
                        provider: 'Dr. Ada Nwosu',
                        nextVisitDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                        reason: '',
                        instructions: ''
                    });
                };

                const handleSaveReferral = () => {
                    if (!referralForm.reason.trim()) return;

                    const referralDocument = {
                        id: 'ref_' + Date.now(),
                        patientId: patient.id,
                        fileName: `Referral - ${referralForm.department}`,
                        documentType: 'Referral Letter',
                        fileUrl: '',
                        uploadedBy: referralForm.provider,
                        uploadedAt: new Date().toISOString(),
                        size: '0.9 KB',
                        department: referralForm.department,
                        urgency: referralForm.urgency,
                        reason: referralForm.reason,
                        notes: referralForm.notes,
                        transferDate: referralForm.transferDate
                    };

                    const nextDocuments = [referralDocument, ...(seedData.documents || [])];
                    persistSeedTable('documents', nextDocuments);
                    seedData.documents = nextDocuments;

                    setReferralForm({
                        department: 'Cardiology',
                        provider: 'Dr. T. Okafor',
                        urgency: 'routine',
                        transferDate: new Date().toISOString().split('T')[0],
                        reason: '',
                        notes: ''
                    });
                };

                const handleSaveOutcome = () => {
                    if (!outcomeForm.summary.trim()) return;

                    const outcomeEntry = {
                        id: 'outcome_' + Date.now(),
                        patientId: patient.id,
                        status: outcomeForm.status,
                        summary: outcomeForm.summary,
                        outcomeDate: outcomeForm.outcomeDate,
                        dischargeInstructions: outcomeForm.dischargeInstructions,
                        createdAt: new Date().toISOString()
                    };

                    const nextDocuments = [
                        {
                            id: 'doc_outcome_' + Date.now(),
                            patientId: patient.id,
                            fileName: `Clinical Outcome - ${patient.patientNumber}`,
                            documentType: 'Outcome Summary',
                            fileUrl: '',
                            uploadedBy: 'Clinical Team',
                            uploadedAt: new Date().toISOString(),
                            size: '1.0 KB',
                            summary: outcomeForm.summary,
                            status: outcomeForm.status
                        },
                        ...(seedData.documents || [])
                    ];

                    persistSeedTable('documents', nextDocuments);
                    seedData.documents = nextDocuments;

                    const nextAlerts = [
                        {
                            id: 'alert_' + Date.now(),
                            patientId: patient.id,
                            alertType: 'outcome',
                            severity: outcomeForm.status === 'critical' ? 'high' : 'normal',
                            message: `Outcome recorded: ${outcomeForm.status}`,
                            status: 'closed',
                            createdAt: new Date().toISOString()
                        },
                        ...(seedData.clinicalAlerts || [])
                    ];
                    persistSeedTable('clinicalAlerts', nextAlerts);
                    seedData.clinicalAlerts = nextAlerts;

                    setOutcomeForm({
                        status: 'recovered',
                        summary: '',
                        outcomeDate: new Date().toISOString().split('T')[0],
                        dischargeInstructions: ''
                    });
                };

                const handleSaveQualityCheck = () => {
                    const qualityNote = {
                        id: 'quality_' + Date.now(),
                        patientId: patient.id,
                        idCheck: qualityForm.idCheck,
                        allergyCheck: qualityForm.allergyCheck,
                        consent: qualityForm.consent,
                        medReconciliation: qualityForm.medReconciliation,
                        dischargeEducation: qualityForm.dischargeEducation,
                        riskScore: qualityForm.riskScore,
                        auditNote: qualityForm.auditNote || 'Quality review completed',
                        reviewedAt: new Date().toISOString()
                    };

                    const nextAudit = [qualityNote, ...(seedData.auditLogs || [])];
                    persistSeedTable('auditLogs', nextAudit);
                    seedData.auditLogs = nextAudit;

                    setQualityForm({
                        idCheck: true,
                        allergyCheck: true,
                        consent: true,
                        medReconciliation: true,
                        dischargeEducation: true,
                        riskScore: 'Low',
                        auditNote: ''
                    });
                };

                const handleSaveCareCoordination = () => {
                    const coordinationEntry = {
                        id: 'coord_' + Date.now(),
                        patientId: patient.id,
                        careCoordinator: careCoordinationForm.careCoordinator || 'Care Team',
                        dischargePlan: careCoordinationForm.dischargePlan || 'Discharge planning initiated',
                        plannedDischargeDate: careCoordinationForm.plannedDischargeDate || new Date().toISOString().split('T')[0],
                        readmissionRisk: careCoordinationForm.readmissionRisk || 'Low',
                        handoffNote: careCoordinationForm.handoffNote || 'No additional handoff notes',
                        createdAt: new Date().toISOString()
                    };

                    const nextAudit = [coordinationEntry, ...(seedData.auditLogs || [])];
                    persistSeedTable('auditLogs', nextAudit);
                    seedData.auditLogs = nextAudit;

                    setCareCoordinationForm({
                        careCoordinator: 'Care Team',
                        dischargePlan: '',
                        plannedDischargeDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                        readmissionRisk: 'Low',
                        handoffNote: ''
                    });
                };

                const clinicalTimeline = [
                    ...encounterNotes.map((encounter) => ({
                        id: encounter.id,
                        type: 'encounter',
                        label: 'Encounter',
                        title: encounter.diagnosis || 'Clinical note',
                        detail: encounter.chiefComplaint,
                        timestamp: encounter.createdAt
                    })),
                    ...patientConditions.map((condition) => ({
                        id: condition.id,
                        type: 'condition',
                        label: 'Problem',
                        title: condition.conditionName,
                        detail: condition.clinicalStatus,
                        timestamp: condition.onsetDate || new Date().toISOString()
                    })),
                    ...patientMedicationOrders.map((order) => ({
                        id: order.id,
                        type: 'medication',
                        label: 'Medication',
                        title: order.medicationName,
                        detail: `${order.dose} ${order.doseUnit} • ${order.frequency}`,
                        timestamp: new Date().toISOString()
                    }))
                ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                const longitudinalSummary = [
                    {
                        title: 'Primary diagnosis',
                        value: encounterNotes[0]?.diagnosis || (patientConditions[0]?.conditionName || 'No diagnosis yet'),
                        accent: 'medical'
                    },
                    {
                        title: 'Current medications',
                        value: patientMedicationOrders.length ? patientMedicationOrders.slice(0, 3).map(item => item.medicationName).join(', ') : 'No active medication orders',
                        accent: 'emerald'
                    },
                    {
                        title: 'Allergy status',
                        value: patientAllergies.length ? patientAllergies.slice(0, 2).map(item => item.substance).join(', ') : 'No recorded allergies',
                        accent: 'amber'
                    },
                    {
                        title: 'Recent admission',
                        value: patientAdmissions[0]?.diagnosis || 'No active admission',
                        accent: 'violet'
                    }
                ];

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

                                        <Card title="Longitudinal Clinical Summary">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {longitudinalSummary.map((item) => (
                                                    <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                                        <p className="text-xs uppercase tracking-wide text-slate-500">{item.title}</p>
                                                        <p className="mt-2 text-sm font-medium text-slate-900">{item.value}</p>
                                                    </div>
                                                ))}
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
                                                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Add diagnosis/problem</p>
                                                    <div className="space-y-3">
                                                        <Input label="Diagnosis/problem name" value={problemForm.conditionName} onChange={(e) => setProblemForm(prev => ({ ...prev, conditionName: e.target.value }))} />
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <Select label="Status" value={problemForm.status} onChange={(e) => setProblemForm(prev => ({ ...prev, status: e.target.value }))} options={[{ value: 'active', label: 'Active' }, { value: 'resolved', label: 'Resolved' }, { value: 'monitoring', label: 'Monitoring' }]} />
                                                            <Input label="Onset date" type="date" value={problemForm.onsetDate} onChange={(e) => setProblemForm(prev => ({ ...prev, onsetDate: e.target.value }))} />
                                                        </div>
                                                        <Button variant="primary" className="w-full justify-center" icon={Icons.FileText} onClick={handleAddProblem}>Add Diagnosis</Button>
                                                    </div>
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

                                        <Card title="Admission & discharge workflow" subtitle="Realistic inpatient continuity">
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <Input label="Ward" value={admissionForm.ward} onChange={(e) => setAdmissionForm(prev => ({ ...prev, ward: e.target.value }))} />
                                                    <Input label="Bed" value={admissionForm.bedNumber} onChange={(e) => setAdmissionForm(prev => ({ ...prev, bedNumber: e.target.value }))} />
                                                </div>
                                                <Input label="Admit date" type="date" value={admissionForm.admissionDate} onChange={(e) => setAdmissionForm(prev => ({ ...prev, admissionDate: e.target.value }))} />
                                                <Select label="Acuity" value={admissionForm.acuity} onChange={(e) => setAdmissionForm(prev => ({ ...prev, acuity: e.target.value }))} options={[{ value: 'stable', label: 'Stable' }, { value: 'urgent', label: 'Urgent' }, { value: 'critical', label: 'Critical' }]} />
                                                <TextArea label="Admission diagnosis / reason" rows={3} value={admissionForm.diagnosis} onChange={(e) => setAdmissionForm(prev => ({ ...prev, diagnosis: e.target.value }))} />
                                                <Button variant="primary" className="w-full justify-center" icon={Icons.Bed} onClick={handleSaveAdmissionNote}>Record Admission</Button>

                                                <div className="border-t border-slate-200 pt-4 mt-2">
                                                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Discharge summary</p>
                                                    <Input label="Discharge date" type="date" value={dischargeForm.dischargeDate} onChange={(e) => setDischargeForm(prev => ({ ...prev, dischargeDate: e.target.value }))} />
                                                    <TextArea label="Summary" rows={3} value={dischargeForm.summary} onChange={(e) => setDischargeForm(prev => ({ ...prev, summary: e.target.value }))} />
                                                    <Input label="Follow-up plan" value={dischargeForm.followUp} onChange={(e) => setDischargeForm(prev => ({ ...prev, followUp: e.target.value }))} />
                                                    <TextArea label="Patient instructions" rows={3} value={dischargeForm.instructions} onChange={(e) => setDischargeForm(prev => ({ ...prev, instructions: e.target.value }))} />
                                                    <Button variant="secondary" className="w-full justify-center mt-2" icon={Icons.FileText} onClick={handleSaveDischargeSummary}>Finalize Discharge</Button>
                                                </div>
                                            </div>
                                        </Card>

                                        <Card title="Follow-up & medication reconciliation" subtitle="Continuity of care after discharge">
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <Input label="Clinic" value={followUpForm.clinic} onChange={(e) => setFollowUpForm(prev => ({ ...prev, clinic: e.target.value }))} />
                                                    <Input label="Provider" value={followUpForm.provider} onChange={(e) => setFollowUpForm(prev => ({ ...prev, provider: e.target.value }))} />
                                                </div>
                                                <Input label="Next visit date" type="date" value={followUpForm.nextVisitDate} onChange={(e) => setFollowUpForm(prev => ({ ...prev, nextVisitDate: e.target.value }))} />
                                                <TextArea label="Reason for follow-up" rows={3} value={followUpForm.reason} onChange={(e) => setFollowUpForm(prev => ({ ...prev, reason: e.target.value }))} />
                                                <TextArea label="Care instructions" rows={3} value={followUpForm.instructions} onChange={(e) => setFollowUpForm(prev => ({ ...prev, instructions: e.target.value }))} />
                                                <Button variant="primary" className="w-full justify-center" icon={Icons.Calendar} onClick={handleSaveFollowUp}>Schedule Follow-up</Button>

                                                <div className="border-t border-slate-200 pt-4">
                                                    <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Recent reconciliation</p>
                                                    <div className="space-y-2 text-sm text-slate-700">
                                                        <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                                            Active meds: {patientMedicationOrders.length ? patientMedicationOrders.slice(0, 3).map(m => m.medicationName).join(', ') : 'No active medications'}
                                                        </div>
                                                        <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                                                            Prescriptions: {patientPrescriptions.length ? patientPrescriptions.length : 0} recorded entries
                                                        </div>
                                                        <div className="p-2 rounded-lg bg-amber-50 border border-amber-100 text-amber-700">
                                                            {patientAllergies.length ? `Safety check: ${patientAllergies[0].substance} allergy on file.` : 'Safety check: no allergy flags recorded.'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </Card>

                                        <Card title="Referral & transfer workflow" subtitle="Specialist handoff and continuity">
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <Input label="Department" value={referralForm.department} onChange={(e) => setReferralForm(prev => ({ ...prev, department: e.target.value }))} />
                                                    <Input label="Receiving provider" value={referralForm.provider} onChange={(e) => setReferralForm(prev => ({ ...prev, provider: e.target.value }))} />
                                                </div>
                                                <Select label="Urgency" value={referralForm.urgency} onChange={(e) => setReferralForm(prev => ({ ...prev, urgency: e.target.value }))} options={[{ value: 'routine', label: 'Routine' }, { value: 'urgent', label: 'Urgent' }, { value: 'stat', label: 'STAT' }]} />
                                                <Input label="Transfer date" type="date" value={referralForm.transferDate} onChange={(e) => setReferralForm(prev => ({ ...prev, transferDate: e.target.value }))} />
                                                <TextArea label="Referral reason" rows={3} value={referralForm.reason} onChange={(e) => setReferralForm(prev => ({ ...prev, reason: e.target.value }))} />
                                                <TextArea label="Clinical notes / handoff" rows={3} value={referralForm.notes} onChange={(e) => setReferralForm(prev => ({ ...prev, notes: e.target.value }))} />
                                                <Button variant="secondary" className="w-full justify-center" icon={Icons.Send} onClick={handleSaveReferral}>Send Referral</Button>
                                            </div>
                                        </Card>

                                        <Card title="Treatment outcome & case closure" subtitle="Final care summary and recovery tracking">
                                            <div className="space-y-4">
                                                <Select label="Outcome status" value={outcomeForm.status} onChange={(e) => setOutcomeForm(prev => ({ ...prev, status: e.target.value }))} options={[{ value: 'recovered', label: 'Recovered' }, { value: 'improving', label: 'Improving' }, { value: 'stable', label: 'Stable' }, { value: 'critical', label: 'Critical' }]} />
                                                <Input label="Outcome date" type="date" value={outcomeForm.outcomeDate} onChange={(e) => setOutcomeForm(prev => ({ ...prev, outcomeDate: e.target.value }))} />
                                                <TextArea label="Clinical outcome summary" rows={3} value={outcomeForm.summary} onChange={(e) => setOutcomeForm(prev => ({ ...prev, summary: e.target.value }))} />
                                                <TextArea label="Discharge / follow-up instructions" rows={3} value={outcomeForm.dischargeInstructions} onChange={(e) => setOutcomeForm(prev => ({ ...prev, dischargeInstructions: e.target.value }))} />
                                                <Button variant="primary" className="w-full justify-center" icon={Icons.CheckCircle} onClick={handleSaveOutcome}>Save Outcome</Button>
                                            </div>
                                        </Card>

                                        <Card title="Quality & safety audit" subtitle="Clinical governance review checklist">
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><input type="checkbox" checked={qualityForm.idCheck} onChange={(e) => setQualityForm(prev => ({ ...prev, idCheck: e.target.checked }))} /> ID verified</label>
                                                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><input type="checkbox" checked={qualityForm.allergyCheck} onChange={(e) => setQualityForm(prev => ({ ...prev, allergyCheck: e.target.checked }))} /> Allergy check</label>
                                                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><input type="checkbox" checked={qualityForm.consent} onChange={(e) => setQualityForm(prev => ({ ...prev, consent: e.target.checked }))} /> Consent signed</label>
                                                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><input type="checkbox" checked={qualityForm.medReconciliation} onChange={(e) => setQualityForm(prev => ({ ...prev, medReconciliation: e.target.checked }))} /> Med reconciliation</label>
                                                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 col-span-2"><input type="checkbox" checked={qualityForm.dischargeEducation} onChange={(e) => setQualityForm(prev => ({ ...prev, dischargeEducation: e.target.checked }))} /> Discharge education provided</label>
                                                </div>
                                                <Select label="Risk score" value={qualityForm.riskScore} onChange={(e) => setQualityForm(prev => ({ ...prev, riskScore: e.target.value }))} options={[{ value: 'Low', label: 'Low' }, { value: 'Moderate', label: 'Moderate' }, { value: 'High', label: 'High' }]} />
                                                <TextArea label="Audit note" rows={3} value={qualityForm.auditNote} onChange={(e) => setQualityForm(prev => ({ ...prev, auditNote: e.target.value }))} />
                                                <Button variant="secondary" className="w-full justify-center" icon={Icons.ShieldAlert} onClick={handleSaveQualityCheck}>Complete Quality Audit</Button>
                                            </div>
                                        </Card>

                                        <Card title="Care coordination & readmission risk" subtitle="Discharge planning and handoff review">
                                            <div className="space-y-4">
                                                <Input label="Care coordinator" value={careCoordinationForm.careCoordinator} onChange={(e) => setCareCoordinationForm(prev => ({ ...prev, careCoordinator: e.target.value }))} />
                                                <Input label="Planned discharge date" type="date" value={careCoordinationForm.plannedDischargeDate} onChange={(e) => setCareCoordinationForm(prev => ({ ...prev, plannedDischargeDate: e.target.value }))} />
                                                <Select label="Readmission risk" value={careCoordinationForm.readmissionRisk} onChange={(e) => setCareCoordinationForm(prev => ({ ...prev, readmissionRisk: e.target.value }))} options={[{ value: 'Low', label: 'Low' }, { value: 'Moderate', label: 'Moderate' }, { value: 'High', label: 'High' }]} />
                                                <TextArea label="Discharge plan" rows={3} value={careCoordinationForm.dischargePlan} onChange={(e) => setCareCoordinationForm(prev => ({ ...prev, dischargePlan: e.target.value }))} />
                                                <TextArea label="Handoff note / community follow-up" rows={3} value={careCoordinationForm.handoffNote} onChange={(e) => setCareCoordinationForm(prev => ({ ...prev, handoffNote: e.target.value }))} />
                                                <Button variant="primary" className="w-full justify-center" icon={Icons.CheckCircle} onClick={handleSaveCareCoordination}>Save Care Coordination</Button>
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

                                        <Card title="Clinical timeline">
                                            <div className="space-y-3">
                                                {clinicalTimeline.length ? clinicalTimeline.slice(0, 8).map((entry) => (
                                                    <div key={entry.id} className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                                                        <div className="mt-1 flex-shrink-0 h-8 w-8 rounded-full bg-medical-100 text-medical-600 flex items-center justify-center">
                                                            {entry.type === 'encounter' ? <Icons.FileText size={14} /> : entry.type === 'condition' ? <Icons.Activity size={14} /> : <Icons.Pill size={14} />}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="text-xs uppercase tracking-wide text-slate-500">{entry.label}</span>
                                                                <span className="text-[11px] text-slate-400">{formatDateTime(entry.timestamp)}</span>
                                                            </div>
                                                            <div className="font-medium text-slate-900 mt-1">{entry.title}</div>
                                                            <div className="text-sm text-slate-600">{entry.detail}</div>
                                                        </div>
                                                    </div>
                                                )) : <p className="text-sm text-slate-500">No clinical events recorded.</p>}
                                            </div>
                                        </Card>
                                    </div>

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
