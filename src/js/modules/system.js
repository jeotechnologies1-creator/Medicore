        // ==========================================
        // AUDIT LOGS MODULE
        // ==========================================
        const AuditModule = () => {
            const [filterSeverity, setFilterSeverity] = useState('all');

            const filteredLogs = appData.auditLogs.filter(log =>
                filterSeverity === 'all' || log.severity === filterSeverity
            );

            const governanceSummary = {
                criticalIncidents: filteredLogs.filter((log) => log.severity === 'critical').length + ((appData.clinicalAlerts || []).filter(item => item.severity === 'critical').length || 0),
                pendingReviews: (appData.auditLogs || []).filter((log) => ['warning', 'critical'].includes(log.severity)).length + (appData.clinicalAlerts || []).filter(alert => alert.status === 'open').length,
                complianceRate: (() => {
                    const checks = [
                        (appData.allergies || []).length > 0 && (appData.medicationOrders || []).length > 0,
                        (appData.labOrders || []).some(item => item.status === 'critical') === false,
                        (appData.documents || []).some(item => item.documentType && item.documentType.toLowerCase().includes('discharge'))
                    ].filter(Boolean).length;
                    const base = checks === 0 ? 0 : Math.round((checks / 3) * 100);
                    return Math.min(100, base || 0);
                })(),
                escalationQueue: (appData.clinicalAlerts || []).filter(alert => alert.status === 'open').length
            };

            const incidentQueue = (appData.auditLogs || []).slice(0, 4).map((log) => ({
                id: log.id || 'LOG-' + Date.now(),
                patient: (appData.patients || []).find(patient => patient.id === log.entityId)?.firstName && (appData.patients || []).find(patient => patient.id === log.entityId)?.lastName
                    ? `${(appData.patients || []).find(patient => patient.id === log.entityId).firstName} ${(appData.patients || []).find(patient => patient.id === log.entityId).lastName}`
                    : 'Unassigned patient',
                area: log.entityType || 'System event',
                issue: log.action || 'Record reviewed',
                status: log.severity === 'critical' ? 'Escalated' : 'Monitoring',
                owner: 'System',
                due: 'Live'
            }));

            const complianceChecks = [
                {
                    title: 'Medication allergy verification',
                    status: ((appData.allergies || []).length > 0 && (appData.medicationOrders || []).length > 0) ? 'pass' : 'review',
                    owner: 'Clinical safety',
                    nextAction: 'Review active medication orders against the allergy list.',
                    sla: 'within 24h'
                },
                {
                    title: 'Critical lab result acknowledgment',
                    status: (appData.labOrders || []).some(item => item.status === 'critical') ? 'escalate' : 'pass',
                    owner: 'Laboratory',
                    nextAction: 'Confirm timely acknowledgment and escalation for any critical findings.',
                    sla: 'within 30 min'
                },
                {
                    title: 'Consent and discharge documentation',
                    status: (appData.documents || []).some(item => item.documentType && item.documentType.toLowerCase().includes('discharge')) ? 'pass' : 'review',
                    owner: 'Clinical records',
                    nextAction: 'Ensure discharge summaries capture patient instructions and consent milestones.',
                    sla: 'within 4h'
                }
            ];
            const escalationQueue = (appData.clinicalAlerts || []).filter(alert => alert.status === 'open').slice(0, 3).map((alert) => ({
                id: alert.id || 'ALERT-' + Date.now(),
                patient: (appData.patients || []).find(patient => patient.id === alert.patientId)
                    ? `${(appData.patients || []).find(patient => patient.id === alert.patientId).firstName} ${(appData.patients || []).find(patient => patient.id === alert.patientId).lastName}`
                    : 'Unassigned patient',
                area: alert.alertType || 'Clinical alert',
                due: alert.severity === 'critical' ? 'Immediate' : 'Review',
                owner: 'Clinical governance'
            }));

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Audit Logs</h2>
                            <p className="text-slate-500 mt-1">System activity, clinical risk monitoring, and automated compliance checks</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" icon={Icons.Filter}>Filter</Button>
                            <Button variant="secondary" icon={Icons.Download}>Export</Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-red-600">Critical incidents</p>
                            <p className="mt-2 text-3xl font-bold text-red-900">{governanceSummary.criticalIncidents}</p>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-amber-600">Pending reviews</p>
                            <p className="mt-2 text-3xl font-bold text-amber-900">{governanceSummary.pendingReviews}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-emerald-600">Compliance rate</p>
                            <p className="mt-2 text-3xl font-bold text-emerald-900">{governanceSummary.complianceRate}%</p>
                        </div>
                        <div className="rounded-2xl border border-medical-200 bg-medical-50 p-4">
                            <p className="text-xs uppercase tracking-wide text-medical-600">Escalation queue</p>
                            <p className="mt-2 text-3xl font-bold text-medical-900">{governanceSummary.escalationQueue}</p>
                        </div>
                    </div>

                    <Card title="Automation checks">
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                            {complianceChecks.length ? complianceChecks.map((check) => (
                                <div key={check.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="font-medium text-slate-900">{check.title}</p>
                                        <Badge variant={check.status === 'pass' ? 'success' : check.status === 'escalate' ? 'danger' : 'warning'}>{check.status}</Badge>
                                    </div>
                                    <p className="mt-3 text-xs text-slate-500">Owner: {check.owner}</p>
                                    <p className="mt-2 text-sm text-slate-700">{check.nextAction}</p>
                                    <p className="mt-2 text-xs text-medical-600">SLA: {check.sla}</p>
                                </div>
                            )) : (
                                <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No compliance checks to display yet. Add records from the hospital workflow to populate this module.</div>
                            )}
                        </div>
                    </Card>

                    <Card title="Escalation queue">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {escalationQueue.length ? escalationQueue.map((item) => (
                                <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs uppercase tracking-wide text-slate-500">{item.id}</p>
                                        <Badge variant="danger">{item.due}</Badge>
                                    </div>
                                    <p className="mt-3 font-semibold text-slate-900">{item.patient}</p>
                                    <p className="mt-1 text-sm text-slate-600">{item.area}</p>
                                    <p className="mt-3 text-xs text-slate-500">Owner: {item.owner}</p>
                                </div>
                            )) : (
                                <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No active escalations. This queue will populate automatically when clinical incidents are logged.</div>
                            )}
                        </div>
                    </Card>

                    <Card title="Clinical governance board">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {incidentQueue.length ? incidentQueue.map((incident) => (
                                <div key={incident.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs uppercase tracking-wide text-slate-500">{incident.id}</p>
                                            <p className="mt-1 font-semibold text-slate-900">{incident.patient}</p>
                                        </div>
                                        <Badge variant={incident.status === 'Escalated' ? 'danger' : incident.status === 'Pending review' ? 'warning' : 'info'}>{incident.status}</Badge>
                                    </div>
                                    <p className="mt-3 text-sm text-slate-600">{incident.area}</p>
                                    <p className="mt-2 text-sm text-slate-700">{incident.issue}</p>
                                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                                        <span>{incident.owner}</span>
                                        <span>{incident.due}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No governance events registered yet. Once logs and alerts are created, they will appear here automatically.</div>
                            )}
                        </div>
                    </Card>

                    <Card>
                        <div className="flex gap-4 mb-6">
                            {['all', 'info', 'warning', 'critical'].map(sev => (
                                <button
                                    key={sev}
                                    onClick={() => setFilterSeverity(sev)}
                                    className={'px-4 py-2 rounded-lg text-sm font-medium transition-colors ' + (filterSeverity === sev ? 'bg-medical-100 text-medical-700' : 'text-slate-600 hover:bg-slate-100')}
                                >
                                    {sev.charAt(0).toUpperCase() + sev.slice(1)}
                                </button>
                            ))}
                        </div>

                        <DataTable
                            columns={[
                                { key: 'timestamp', title: 'Timestamp', render: (row) => formatDateTime(row.timestamp), className: 'whitespace-nowrap' },
                                { key: 'user', title: 'User', render: (row) => {
                                    const user = appData.users.find(u => u.id === row.userId);
                                    return user ? (
                                        <div className="flex items-center gap-2">
                                            <Avatar name={user.name} size="sm" />
                                            <span>{user.name}</span>
                                        </div>
                                    ) : row.userId;
                                }},
                                { key: 'action', title: 'Action', render: (row) => <Badge variant="info">{row.action}</Badge> },
                                { key: 'entityType', title: 'Entity' },
                                { key: 'ipAddress', title: 'IP Address', className: 'font-mono text-xs' },
                                { key: 'severity', title: 'Severity', render: (row) => <Badge variant={row.severity === 'critical' ? 'danger' : row.severity === 'warning' ? 'warning' : 'default'}>{row.severity}</Badge> }
                            ]}
                            data={filteredLogs}
                            actions={(row) => (
                                <Button variant="ghost" size="sm" icon={Icons.Eye}>Details</Button>
                            )}
                        />
                    </Card>
                </div>
            );
        };

        // ==========================================
        // COMPLIANCE VAULT MODULE
        // ==========================================
        const ComplianceVaultModule = () => {
            const documents = appData.documents || [];
            const files = documents.map((document) => ({
                id: document.id,
                name: document.fileName || 'Unnamed document',
                category: document.documentType || 'Clinical document',
                patient: (() => {
                    const patient = (appData.patients || []).find((item) => item.id === document.patientId);
                    return patient ? `${patient.firstName} ${patient.lastName}` : 'Unassigned patient';
                })(),
                updated: document.createdAt || document.uploadedAt,
                status: 'Stored'
            }));
            const openAlerts = (appData.clinicalAlerts || []).filter((item) => item.status === 'open');
            const reviewRecords = (appData.auditLogs || []).filter((item) => ['warning', 'critical'].includes(item.severity));
            const complianceChecks = [
                (appData.allergies || []).length > 0 && (appData.medicationOrders || []).length > 0,
                !(appData.labOrders || []).some((item) => item.status === 'critical'),
                documents.some((item) => String(item.documentType || '').toLowerCase().includes('discharge'))
            ];
            const complianceRate = Math.round((complianceChecks.filter(Boolean).length / complianceChecks.length) * 100);

            const automationSummary = [
                { label: 'High-risk events', value: (appData.clinicalAlerts || []).filter(item => item.severity === 'critical').length },
                { label: 'Open incidents', value: (appData.clinicalAlerts || []).filter(item => item.status === 'open').length },
                { label: 'Records to review', value: Math.max(0, (appData.auditLogs || []).length) },
                { label: 'Retention coverage', value: '—' }
            ];

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Compliance Vault</h2>
                            <p className="text-slate-500 mt-1">Document control, policy access, and governance oversight</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Clinical documents" value={documents.length} icon={Icons.FileText} color="emerald" />
                        <StatCard title="Pending reviews" value={reviewRecords.length + openAlerts.length} icon={Icons.AlertCircle} color="amber" />
                        <StatCard title="Open incidents" value={openAlerts.length} icon={Icons.ShieldCheck} color="medical" />
                        <StatCard title="Compliance checks" value={`${complianceRate}%`} icon={Icons.BarChart3} color="violet" />
                    </div>

                    <Card title="Automated oversight metrics">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {automationSummary.map((item) => (
                                <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                                    <p className="mt-2 text-2xl font-bold text-slate-900">{item.value}</p>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <Card title="Clinical document register"><p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Policies are not represented by a Supabase table in the current schema. The repository lists the persisted clinical documents below.</p></Card>

                        <Card title="Document repository">
                            {files.length ? (
                                <DataTable
                                    columns={[
                                        { key: 'name', title: 'Document' },
                                        { key: 'category', title: 'Category' },
                                        { key: 'patient', title: 'Patient' },
                                        { key: 'updated', title: 'Uploaded', render: (row) => formatDateTime(row.updated) },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant="info">{row.status}</Badge> }
                                    ]}
                                    data={files}
                                    actions={() => (
                                        <Button variant="ghost" size="sm" icon={Icons.Eye}>View</Button>
                                    )}
                                />
                            ) : (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">No documents are in the compliance vault yet.</div>
                            )}
                        </Card>
                    </div>
                </div>
            );
        };

        // ==========================================
        // SETTINGS MODULE
        // ==========================================
        const SettingsModule = () => {
            const defaultSettings = {
                facilityName: '',
                facilityCode: '',
                bankAccounts: [],
                timezone: 'UTC',
                locale: 'en-US',
                currency: 'USD',
                contactEmail: '',
                phone: '',
                serviceLine: '',
                sessionTimeoutMinutes: 30,
                requireMfa: true,
                lockAfterFailedAttempts: 5,
                passwordMinLength: 8,
                roleBasedAccess: true,
                auditRetentionDays: 2555,
                autoLogoutIdle: true,
                requirePatientIdVerification: true,
                requireAllergyCheck: true,
                requireMedicationVerification: true,
                requireClinicalNoteBeforeDischarge: true,
                enableBarcodeMedicationCheck: true,
                allowPatientPortalAccess: true,
                requireConsentForDataSharing: true,
                enableHl7: true,
                enableFhir: true,
                enableAutoBackups: true,
                backupSchedule: 'Daily at 02:00',
                alertForCriticalLabs: true,
                criticalLabEscalationHours: 1,
                appointmentBufferMinutes: 15,
                followUpDefaultDays: 14,
                pharmacyReorderLevelThreshold: 30,
                enableAuditTrail: true,
                keepSystemLogs: true,
                auditArchiveFrequency: 'Monthly',
                dataRetentionPolicy: '7 years clinical; 10 years financial',
                backupRetentionDays: 90,
                encryptionAtRest: true,
                encryptionInTransit: true,
                incidentReportingSlaHours: 24,
                complianceMonitoring: true,
                annualAuditCycle: 'Q4 review'
            };

            const permissionDepartments = [
                { key: 'dashboard', label: 'Dashboard' },
                { key: 'patients', label: 'Patients' },
                { key: 'appointments', label: 'Appointments' },
                { key: 'doctors', label: 'Doctors' },
                { key: 'laboratory', label: 'Laboratory' },
                { key: 'radiology', label: 'Radiology' },
                { key: 'clinical_workflows', label: 'Clinical Workflows' },
                { key: 'clinical_decision_support', label: 'Clinical Support' },
                { key: 'operations', label: 'Operations' },
                { key: 'procurement', label: 'Procurement' },
                { key: 'referrals', label: 'Referrals' },
                { key: 'workforce', label: 'Workforce' },
                { key: 'pharmacy', label: 'Pharmacy' },
                { key: 'billing', label: 'Billing' },
                { key: 'insurance', label: 'Insurance' },
                { key: 'payments', label: 'Payments' },
                { key: 'documents', label: 'Documents' },
                { key: 'compliance', label: 'Compliance' },
                { key: 'admissions', label: 'Admissions' },
                { key: 'surgeries', label: 'Surgeries' },
                { key: 'clinical_safety', label: 'Clinical Safety' },
                { key: 'inventory', label: 'Inventory' },
                { key: 'hr', label: 'HR & Staff' },
                { key: 'offices', label: 'Medical Offices' },
                { key: 'reports', label: 'Reports' },
                { key: 'audit', label: 'Audit Logs' },
                { key: 'settings', label: 'Settings' }
            ];
            const permissionAliases = {
                appointments: 'appointment', doctors: 'doctor', laboratory: 'labs', radiology: 'imaging',
                clinical_workflows: 'encounters', clinical_decision_support: 'cds', operations: 'ops',
                procurement: 'supply_chain', referrals: 'care_coordination', workforce: 'staffing',
                insurance: 'claims', payments: 'payment', documents: 'document_control', compliance: 'governance',
                admissions: 'ward', surgeries: 'surgery', clinical_safety: 'safety', inventory: 'stock',
                hr: 'staff', offices: 'office', reports: 'report', audit: 'audit_logs', settings: 'system_settings'
            };
            const normalizeMatrixRows = (matrix) => (matrix || []).map((row) => {
                const isSuperAdmin = String(row.role || '').trim().toLowerCase().replace(/\s+/g, '_') === 'super_admin';
                return {
                    ...row,
                    permissions: permissionDepartments.reduce((permissions, department) => {
                        const value = row.permissions?.[department.key] ?? row.permissions?.[permissionAliases[department.key]];
                        return { ...permissions, [department.key]: value === undefined ? isSuperAdmin : Boolean(value) };
                    }, { ...(row.permissions || {}) })
                };
            });

            const initialRoleMatrix = [
                {
                    role: 'Super Admin',
                    permissions: {
                        dashboard: true,
                        patients: true,
                        appointments: true,
                        doctors: true,
                        laboratory: true,
                        radiology: true,
                        pharmacy: true,
                        billing: true,
                        insurance: true,
                        payments: true,
                        documents: true,
                        compliance: true,
                        admissions: true,
                        surgeries: true,
                        clinical_safety: true,
                        inventory: true,
                        hr: true,
                        offices: true,
                        reports: true,
                        audit: true,
                        settings: true
                    }
                },
                {
                    role: 'Doctor',
                    permissions: {
                        dashboard: true,
                        patients: true,
                        appointments: true,
                        doctors: true,
                        laboratory: true,
                        radiology: true,
                        pharmacy: false,
                        billing: false,
                        insurance: false,
                        payments: false,
                        documents: true,
                        compliance: true,
                        admissions: false,
                        surgeries: false,
                        clinical_safety: true,
                        inventory: false,
                        hr: false,
                        offices: false,
                        reports: false,
                        audit: false,
                        settings: false
                    }
                },
                {
                    role: 'Nurse',
                    permissions: {
                        dashboard: true,
                        patients: true,
                        appointments: false,
                        doctors: false,
                        laboratory: false,
                        radiology: false,
                        pharmacy: false,
                        billing: false,
                        insurance: false,
                        payments: false,
                        documents: true,
                        compliance: true,
                        admissions: true,
                        surgeries: false,
                        clinical_safety: true,
                        inventory: false,
                        hr: false,
                        offices: false,
                        reports: false,
                        audit: false,
                        settings: false
                    }
                },
                {
                    role: 'Pharmacist',
                    permissions: {
                        dashboard: true,
                        patients: false,
                        appointments: false,
                        doctors: false,
                        laboratory: false,
                        radiology: false,
                        pharmacy: true,
                        billing: false,
                        insurance: false,
                        payments: false,
                        documents: true,
                        compliance: false,
                        admissions: false,
                        surgeries: false,
                        clinical_safety: false,
                        inventory: true,
                        hr: false,
                        offices: false,
                        reports: false,
                        audit: false,
                        settings: false
                    }
                },
                {
                    role: 'Receptionist',
                    permissions: {
                        dashboard: true,
                        patients: true,
                        appointments: true,
                        doctors: false,
                        laboratory: false,
                        radiology: false,
                        pharmacy: false,
                        billing: true,
                        insurance: false,
                        payments: false,
                        documents: false,
                        compliance: false,
                        admissions: false,
                        surgeries: false,
                        clinical_safety: false,
                        inventory: false,
                        hr: false,
                        offices: false,
                        reports: false,
                        audit: false,
                        settings: false
                    }
                },
                {
                    role: 'Laboratory Scientist',
                    permissions: {
                        dashboard: true,
                        laboratory: true
                    }
                },
                {
                    role: 'Radiographer',
                    permissions: {
                        dashboard: true,
                        radiology: true
                    }
                },
                {
                    role: 'Accountant',
                    permissions: {
                        dashboard: true,
                        billing: true,
                        insurance: true,
                        payments: true,
                        reports: true
                    }
                }
            ];

            const completeMatrixRows = (matrix) => {
                const savedRows = Array.isArray(matrix) ? matrix : [];
                const savedRoles = new Set(savedRows.map((row) => String(row?.role || '').trim().toLowerCase().replace(/\s+/g, '_')));
                const missingDefaultRoles = initialRoleMatrix.filter((row) => !savedRoles.has(String(row.role).toLowerCase().replace(/\s+/g, '_')));
                return normalizeMatrixRows([...savedRows, ...missingDefaultRoles]);
            };

            const initialDepartments = (appData.wards || []).filter((ward) => ward?.id && ward?.name).map((ward) => ({
                id: ward.id,
                name: ward.name,
                type: ward.type || 'Ward',
                capacity: Number(ward.capacity || 0),
                status: ward.status || 'active'
            }));

            const [settings, setSettings] = useState(() => {
                try {
                    const saved = JSON.parse(localStorage.getItem('onemed_settings') || '{}');
                    const sanitizedSaved = { ...saved };
                    if (sanitizedSaved.facilityName === 'OneMed Hospital') sanitizedSaved.facilityName = '';
                    if (sanitizedSaved.facilityCode === 'MC-001') sanitizedSaved.facilityCode = '';
                    if (sanitizedSaved.phone === '+1 (800) 555-0147') sanitizedSaved.phone = '';
                    if (sanitizedSaved.serviceLine === 'General Hospital & Outpatient Clinics') sanitizedSaved.serviceLine = '';
                    return { ...defaultSettings, ...sanitizedSaved };
                } catch (e) {
                    return defaultSettings;
                }
            });
            const [saveMessage, setSaveMessage] = useState('');
            const [bankAccountDraft, setBankAccountDraft] = useState({ bankName: '', accountName: '', accountNumber: '' });
            const [roleMatrix, setRoleMatrix] = useState(() => {
                try {
                    const saved = JSON.parse(localStorage.getItem('onemed_role_matrix') || '[]');
                    if (Array.isArray(saved) && saved.length) {
                        return completeMatrixRows(saved);
                    }
                } catch (e) {}
                return completeMatrixRows(initialRoleMatrix);
            });
            const [departments, setDepartments] = useState(initialDepartments);
            const [exportHistory, setExportHistory] = useState([]);
            const [departmentDraft, setDepartmentDraft] = useState({
                name: '',
                type: 'Ward',
                capacity: 20,
                status: 'active'
            });

            useEffect(() => {
                const hydrateFromSupabase = async () => {
                    try {
                        if (window.OneMedSupabase && typeof window.OneMedSupabase.loadSystemSettings === 'function') {
                            const remoteSettings = await window.OneMedSupabase.loadSystemSettings();
                            if (remoteSettings && Object.keys(remoteSettings).length) {
                                const { roleMatrix: remoteRoleMatrix, ...remoteOnlySettings } = remoteSettings;
                                setSettings(prev => ({ ...prev, ...remoteOnlySettings }));
                                if (Array.isArray(remoteRoleMatrix) && remoteRoleMatrix.length) {
                                    const normalizedRemote = completeMatrixRows(remoteRoleMatrix);
                                    setRoleMatrix(normalizedRemote);
                                }
                            }
                        }
                        if (window.OneMedSupabase && typeof window.OneMedSupabase.loadDepartments === 'function') {
                            const remoteDepartments = await window.OneMedSupabase.loadDepartments();
                            if (remoteDepartments && remoteDepartments.length) {
                                setDepartments(remoteDepartments);
                            }
                        }
                        if (window.OneMedSupabase && typeof window.OneMedSupabase.loadComplianceExports === 'function') {
                            const remoteExports = await window.OneMedSupabase.loadComplianceExports();
                            setExportHistory(remoteExports || []);
                        }
                    } catch (e) {
                        console.warn('Supabase settings hydration unavailable:', e);
                    }
                };

                hydrateFromSupabase();
            }, []);

            const updateSetting = (key, value) => {
                setSettings(prev => ({ ...prev, [key]: value }));
            };

            const addBankAccount = () => {
                const bankName = bankAccountDraft.bankName.trim();
                const accountName = bankAccountDraft.accountName.trim();
                const accountNumber = bankAccountDraft.accountNumber.replace(/\s+/g, '');
                if (!bankName || !accountName || !/^\d{10}$/.test(accountNumber)) {
                    setSaveMessage('Enter a bank name, account name, and a valid 10-digit Nigerian account number.');
                    return;
                }
                if ((settings.bankAccounts || []).some((account) => account.accountNumber === accountNumber)) {
                    setSaveMessage('This bank account is already listed.');
                    return;
                }
                updateSetting('bankAccounts', [...(settings.bankAccounts || []), { bankName, accountName, accountNumber, primary: !(settings.bankAccounts || []).length }]);
                setBankAccountDraft({ bankName: '', accountName: '', accountNumber: '' });
                setSaveMessage('Bank account added. Save Settings to make it available to Billing.');
            };

            const removeBankAccount = (accountNumber) => {
                const remaining = (settings.bankAccounts || []).filter((account) => account.accountNumber !== accountNumber);
                updateSetting('bankAccounts', remaining.map((account, index) => ({ ...account, primary: index === 0 })));
            };

            const saveSettings = async () => {
                try {
                    const cleanedMatrix = completeMatrixRows(roleMatrix);
                    setRoleMatrix(cleanedMatrix);
                    if (window.OneMedSupabase && typeof window.OneMedSupabase.saveSystemSettings === 'function') {
                        const { error } = await window.OneMedSupabase.saveSystemSettings(settings, cleanedMatrix);
                        if (error) {
                            setSaveMessage('Settings were not saved. Supabase rejected the change.');
                            return;
                        }
                    } else {
                        setSaveMessage('Settings were not saved. Connect Supabase to apply access changes.');
                        return;
                    }
                    window.dispatchEvent(new CustomEvent('onemed:access-policy-updated', { detail: { roleMatrix: cleanedMatrix } }));
                    setSaveMessage('Settings and role matrix saved successfully.');
                } catch (e) {
                    setSaveMessage('Unable to save settings in this browser session.');
                }
            };

            const resetSettings = async () => {
                setSettings(defaultSettings);
                const resetMatrix = completeMatrixRows(initialRoleMatrix);
                setRoleMatrix(resetMatrix);
                setDepartments(initialDepartments);
                try {
                    if (window.OneMedSupabase && typeof window.OneMedSupabase.saveSystemSettings === 'function') {
                        const { error } = await window.OneMedSupabase.saveSystemSettings(defaultSettings, resetMatrix);
                        if (error) {
                            setSaveMessage('Baseline settings were not saved. Supabase rejected the change.');
                            return;
                        }
                    } else {
                        setSaveMessage('Baseline settings were not saved. Connect Supabase to apply access changes.');
                        return;
                    }
                    window.dispatchEvent(new CustomEvent('onemed:access-policy-updated', { detail: { roleMatrix: resetMatrix } }));
                    setSaveMessage('Baseline EMR settings restored.');
                } catch (e) {
                    setSaveMessage('Baseline settings restored locally.');
                }
            };

            const togglePermission = (roleName, permissionKey) => {
                const canonicalKey = permissionKey;
                setRoleMatrix(prev => {
                    const next = prev.map(role =>
                        role.role === roleName
                            ? {
                                ...role,
                                permissions: {
                                    ...role.permissions,
                                    [canonicalKey]: !(role.permissions?.[canonicalKey] ?? false)
                                }
                            }
                            : role
                    );
                    return next;
                });
            };

            const addDepartment = async () => {
                const trimmedName = departmentDraft.name.trim();
                if (!trimmedName) {
                    setSaveMessage('Department name is required before creating a unit.');
                    return;
                }
                if (departments.some((department) => department.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
                    setSaveMessage('A department or ward with this name already exists.');
                    return;
                }
                if (Number(departmentDraft.capacity) < 1) {
                    setSaveMessage('Capacity must be at least 1.');
                    return;
                }

                const newDepartment = {
                    name: trimmedName,
                    type: departmentDraft.type,
                    capacity: Number(departmentDraft.capacity || 20),
                    status: departmentDraft.status,
                    occupied: 0
                };

                try {
                    if (!window.OneMedSupabase?.createDepartment) throw new Error('Supabase is not configured.');
                    const { data: savedDepartment, error } = await window.OneMedSupabase.createDepartment(newDepartment);
                    if (error || !savedDepartment) throw error || new Error('The department could not be saved.');
                    setDepartments(prev => [...prev, savedDepartment].sort((a, b) => a.name.localeCompare(b.name)));
                    setDepartmentDraft({ name: '', type: 'Ward', capacity: 20, status: 'active' });
                    setSaveMessage('Department/ward added successfully.');
                } catch (e) {
                    setSaveMessage(`Department was not added: ${e.message || 'unable to save to Supabase.'}`);
                }
            };

            const updateDepartment = async (id, field, value) => {
                const nextDepartments = departments.map(item =>
                    item.id === id ? { ...item, [field]: field === 'capacity' ? Number(value || 0) : value } : item
                );
                const changedDepartment = nextDepartments.find((item) => item.id === id);
                if (field === 'capacity' && changedDepartment.capacity < 1) {
                    setSaveMessage('Capacity must be at least 1.');
                    return;
                }
                setDepartments(nextDepartments);

                try {
                    if (!window.OneMedSupabase?.updateDepartment) throw new Error('Supabase is not configured.');
                    const { data: savedDepartment, error } = await window.OneMedSupabase.updateDepartment(id, changedDepartment);
                    if (error || !savedDepartment) throw error || new Error('The department could not be saved.');
                    setDepartments(current => current.map((item) => item.id === id ? savedDepartment : item));
                } catch (e) {
                    setDepartments(departments);
                    setSaveMessage(`Department update was not saved: ${e.message || 'unable to save to Supabase.'}`);
                }
            };

            const removeDepartment = async (id) => {
                const nextDepartments = departments.filter(item => item.id !== id);
                setDepartments(nextDepartments);
                try {
                    if (!window.OneMedSupabase?.deleteDepartment) throw new Error('Supabase is not configured.');
                    const { error } = await window.OneMedSupabase.deleteDepartment(id);
                    if (error) throw error;
                    setSaveMessage('Department removed from the configuration.');
                } catch (e) {
                    setDepartments(departments);
                    setSaveMessage(`Department was not removed: ${e.message || 'unable to save to Supabase.'}`);
                }
            };

            const handleAuditExport = async () => {
                const headers = ['timestamp', 'userId', 'action', 'entityType', 'severity', 'ipAddress'];
                const rows = appData.auditLogs.map((log) => [
                    log.timestamp,
                    log.userId,
                    log.action,
                    log.entityType,
                    log.severity,
                    log.ipAddress
                ]);

                const csv = [headers, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'onemed-audit-export.csv';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                try {
                    if (window.OneMedSupabase && typeof window.OneMedSupabase.recordComplianceExport === 'function') {
                        const result = await window.OneMedSupabase.recordComplianceExport('audit_csv', 'onemed-audit-export.csv', rows.length, {
                            generatedBy: 'super_admin',
                            fileType: 'csv'
                        });
                        if (result && result.data) {
                            setExportHistory(prev => [
                                {
                                    id: result.data.id,
                                    exportType: result.data.export_type,
                                    fileName: result.data.file_name,
                                    recordCount: result.data.record_count,
                                    exportedAt: result.data.exported_at,
                                    metadata: result.data.metadata || {}
                                },
                                ...prev
                            ]);
                        }
                    }
                } catch (e) {
                    console.warn('Compliance export history not persisted:', e);
                }

                setSaveMessage('Audit log export downloaded successfully.');
            };

            const complianceChecks = [
                {
                    label: 'Backup status',
                    value: settings.enableAutoBackups ? 'Healthy' : 'Disabled',
                    tone: settings.enableAutoBackups ? 'success' : 'warning'
                },
                {
                    label: 'Encryption at rest',
                    value: settings.encryptionAtRest ? 'Enabled' : 'Off',
                    tone: settings.encryptionAtRest ? 'success' : 'warning'
                },
                {
                    label: 'Audit retention',
                    value: `${settings.auditRetentionDays} days`,
                    tone: 'success'
                },
                {
                    label: 'Incident response SLA',
                    value: `${settings.incidentReportingSlaHours}h`,
                    tone: 'info'
                }
            ];

            const complianceChart = [
                { label: 'Backups', value: settings.enableAutoBackups ? 100 : 0 },
                { label: 'Security', value: settings.requireMfa ? 100 : 0 },
                { label: 'Retention', value: Number(settings.auditRetentionDays || 0) > 0 ? 100 : 0 },
                { label: 'Interoperability', value: settings.enableFhir ? 100 : 0 }
            ];

            const ToggleRow = ({ label, description, checked, onChange }) => (
                <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div>
                        <p className="text-sm font-medium text-slate-800">{label}</p>
                        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={() => onChange(!checked)}
                        className={'relative inline-flex h-6 w-11 items-center rounded-full transition-colors ' + (checked ? 'bg-medical-600' : 'bg-slate-300')}
                        aria-label={label}
                    >
                        <span className={'inline-block h-5 w-5 rounded-full bg-white transition-transform ' + (checked ? 'translate-x-5' : 'translate-x-1')} />
                    </button>
                </div>
            );

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">System Settings</h2>
                            <p className="text-slate-500 mt-1">Core hospital configuration, security posture, and clinical governance controls</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={resetSettings}>Reset</Button>
                            <Button variant="primary" onClick={saveSettings}>Save Settings</Button>
                        </div>
                    </div>

                    {saveMessage && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{saveMessage}</div>}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card title="Facility & Identity">
                            <div className="space-y-4">
                                <Input label="Facility name" value={settings.facilityName} onChange={(e) => updateSetting('facilityName', e.target.value)} />
                                <Input label="Facility code" value={settings.facilityCode} onChange={(e) => updateSetting('facilityCode', e.target.value)} />
                                <div className="grid grid-cols-2 gap-4">
                                    <Input label="Timezone" value={settings.timezone} onChange={(e) => updateSetting('timezone', e.target.value)} />
                                    <Input label="Currency" value={settings.currency} onChange={(e) => updateSetting('currency', e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <Input label="Locale" value={settings.locale} onChange={(e) => updateSetting('locale', e.target.value)} />
                                    <Input label="Phone" value={settings.phone} onChange={(e) => updateSetting('phone', e.target.value)} />
                                </div>
                                <Input label="Admin email" type="email" value={settings.contactEmail} onChange={(e) => updateSetting('contactEmail', e.target.value)} />
                                <Input label="Service line" value={settings.serviceLine} onChange={(e) => updateSetting('serviceLine', e.target.value)} />
                            </div>
                        </Card>

                        <Card title="Bank Transfer Accounts (NGN)">
                            <p className="mb-4 text-sm text-slate-500">Only a Super Admin can maintain these verified payment instructions. They are shown when Finance posts a bank-transfer payment.</p>
                            <div className="space-y-3">
                                {(settings.bankAccounts || []).map((account) => (
                                    <div key={account.accountNumber} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                                        <div>
                                            <p className="font-medium text-slate-800">{account.bankName} {account.primary ? <span className="text-xs text-medical-600">Primary</span> : null}</p>
                                            <p className="text-xs text-slate-500">{account.accountName} · {account.accountNumber}</p>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => removeBankAccount(account.accountNumber)}>Remove</Button>
                                    </div>
                                ))}
                                <Input label="Bank name" value={bankAccountDraft.bankName} onChange={(e) => setBankAccountDraft(prev => ({ ...prev, bankName: e.target.value }))} />
                                <Input label="Account name" value={bankAccountDraft.accountName} onChange={(e) => setBankAccountDraft(prev => ({ ...prev, accountName: e.target.value }))} />
                                <Input label="10-digit account number" inputMode="numeric" value={bankAccountDraft.accountNumber} onChange={(e) => setBankAccountDraft(prev => ({ ...prev, accountNumber: e.target.value }))} />
                                <Button variant="secondary" size="sm" onClick={addBankAccount}>Add bank account</Button>
                            </div>
                        </Card>

                        <Card title="Security & Access Control">
                            <div className="space-y-4">
                                <Input label="Session timeout (minutes)" type="number" value={settings.sessionTimeoutMinutes} onChange={(e) => updateSetting('sessionTimeoutMinutes', Number(e.target.value || 30))} />
                                <Input label="Password minimum length" type="number" value={settings.passwordMinLength} onChange={(e) => updateSetting('passwordMinLength', Number(e.target.value || 8))} />
                                <Input label="Failed attempts before lock" type="number" value={settings.lockAfterFailedAttempts} onChange={(e) => updateSetting('lockAfterFailedAttempts', Number(e.target.value || 5))} />
                                <Input label="Audit retention (days)" type="number" value={settings.auditRetentionDays} onChange={(e) => updateSetting('auditRetentionDays', Number(e.target.value || 2555))} />
                                <div className="space-y-3">
                                    <ToggleRow label="Require MFA for staff" description="Strongly recommended for admin and clinical roles" checked={settings.requireMfa} onChange={(value) => updateSetting('requireMfa', value)} />
                                    <ToggleRow label="Auto logout idle users" description="Protects patient data when a browser is left open" checked={settings.autoLogoutIdle} onChange={(value) => updateSetting('autoLogoutIdle', value)} />
                                    <ToggleRow label="Role-based access enforcement" description="Restrict organization and clinical access by role" checked={settings.roleBasedAccess} onChange={(value) => updateSetting('roleBasedAccess', value)} />
                                    <ToggleRow label="Keep system audit trail" description="Required for traceability and regulatory review" checked={settings.enableAuditTrail} onChange={(value) => updateSetting('enableAuditTrail', value)} />
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card title="Clinical Safety Standards">
                            <div className="space-y-4">
                                <Input label="Default follow-up period (days)" type="number" value={settings.followUpDefaultDays} onChange={(e) => updateSetting('followUpDefaultDays', Number(e.target.value || 14))} />
                                <Input label="Appointment buffer (minutes)" type="number" value={settings.appointmentBufferMinutes} onChange={(e) => updateSetting('appointmentBufferMinutes', Number(e.target.value || 15))} />
                                <Input label="Pharmacy reorder warning threshold (%)" type="number" value={settings.pharmacyReorderLevelThreshold} onChange={(e) => updateSetting('pharmacyReorderLevelThreshold', Number(e.target.value || 30))} />
                                <div className="space-y-3">
                                    <ToggleRow label="Require patient ID verification" description="Supports positive patient identification before treatment" checked={settings.requirePatientIdVerification} onChange={(value) => updateSetting('requirePatientIdVerification', value)} />
                                    <ToggleRow label="Require allergy check before medication" description="Critical for medication safety and risk reduction" checked={settings.requireAllergyCheck} onChange={(value) => updateSetting('requireAllergyCheck', value)} />
                                    <ToggleRow label="Require medication verification" description="Helps prevent wrong-drug and wrong-dose errors" checked={settings.requireMedicationVerification} onChange={(value) => updateSetting('requireMedicationVerification', value)} />
                                    <ToggleRow label="Clinical note required before discharge" description="Supports continuity of care and documentation quality" checked={settings.requireClinicalNoteBeforeDischarge} onChange={(value) => updateSetting('requireClinicalNoteBeforeDischarge', value)} />
                                    <ToggleRow label="Barcode scan for medication administration" description="Standard for safer medication workflows" checked={settings.enableBarcodeMedicationCheck} onChange={(value) => updateSetting('enableBarcodeMedicationCheck', value)} />
                                </div>
                            </div>
                        </Card>

                        <Card title="Privacy, Interoperability & Reporting">
                            <div className="space-y-4">
                                <Input label="Backup schedule" value={settings.backupSchedule} onChange={(e) => updateSetting('backupSchedule', e.target.value)} />
                                <Input label="Critical lab escalation (hours)" type="number" value={settings.criticalLabEscalationHours} onChange={(e) => updateSetting('criticalLabEscalationHours', Number(e.target.value || 1))} />
                                <div className="space-y-3">
                                    <ToggleRow label="HIPAA/privacy compliance mode" description="Matches standard patient privacy safeguards" checked={true} onChange={() => null} />
                                    <ToggleRow label="Patient portal access" description="Allows patients to view records and appointments" checked={settings.allowPatientPortalAccess} onChange={(value) => updateSetting('allowPatientPortalAccess', value)} />
                                    <ToggleRow label="Consent required for sharing" description="Supports patient consent and legal governance" checked={settings.requireConsentForDataSharing} onChange={(value) => updateSetting('requireConsentForDataSharing', value)} />
                                    <ToggleRow label="HL7 interoperability" description="Supports clinical message exchange with external systems" checked={settings.enableHl7} onChange={(value) => updateSetting('enableHl7', value)} />
                                    <ToggleRow label="FHIR-ready integration" description="Supports modern interoperability standards" checked={settings.enableFhir} onChange={(value) => updateSetting('enableFhir', value)} />
                                    <ToggleRow label="Automatic backups" description="Reduces downtime and supports continuity of care" checked={settings.enableAutoBackups} onChange={(value) => updateSetting('enableAutoBackups', value)} />
                                    <ToggleRow label="Critical lab alerts" description="Escalates abnormal results to responsible clinical staff" checked={settings.alertForCriticalLabs} onChange={(value) => updateSetting('alertForCriticalLabs', value)} />
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card title="Role-Permission Matrix">
                            <p className="mb-4 text-sm text-slate-500">Set access for every clinical, operational, financial, and administrative department. Changes take effect as soon as they are toggled; save to persist them for all users.</p>
                            <DataTable
                                columns={[
                                    {
                                        key: 'role',
                                        title: 'Role',
                                        render: (row) => (
                                            <div>
                                                <p className="font-medium text-slate-800">{row.role}</p>
                                                <p className="text-xs text-slate-500">Access profile</p>
                                            </div>
                                        )
                                    },
                                    ...permissionDepartments.map((department) => ({
                                        key: department.key,
                                        title: department.label,
                                        className: 'text-center',
                                        render: (row) => (
                                            <input
                                                type="checkbox"
                                                checked={Boolean(row.permissions?.[department.key])}
                                                onChange={() => togglePermission(row.role, department.key)}
                                                className="h-4 w-4 rounded border-slate-300 text-medical-600 focus:ring-medical-500"
                                                aria-label={`${row.role}: ${department.label}`}
                                            />
                                        )
                                    }))
                                ]}
                                data={roleMatrix}
                            />
                        </Card>

                        <Card title="Audit Export & Retention Policies">
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <Input label="Retention policy (days)" type="number" value={settings.auditRetentionDays} onChange={(e) => updateSetting('auditRetentionDays', Number(e.target.value || 2555))} />
                                    <Input label="Archive frequency" value={settings.auditArchiveFrequency} onChange={(e) => updateSetting('auditArchiveFrequency', e.target.value)} />
                                </div>
                                <Input label="Data retention policy" value={settings.dataRetentionPolicy} onChange={(e) => updateSetting('dataRetentionPolicy', e.target.value)} />
                                <Input label="Backup retention (days)" type="number" value={settings.backupRetentionDays} onChange={(e) => updateSetting('backupRetentionDays', Number(e.target.value || 90))} />
                                <div className="space-y-3">
                                    <ToggleRow label="Encrypt data at rest" checked={settings.encryptionAtRest} onChange={(value) => updateSetting('encryptionAtRest', value)} />
                                    <ToggleRow label="Encrypt data in transit" checked={settings.encryptionInTransit} onChange={(value) => updateSetting('encryptionInTransit', value)} />
                                    <ToggleRow label="Monitoring and compliance checks" checked={settings.complianceMonitoring} onChange={(value) => updateSetting('complianceMonitoring', value)} />
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="secondary" onClick={handleAuditExport}>Export Audit CSV</Button>
                                    <Button variant="primary">Archive Now</Button>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card title="Department & Ward Editing">
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <Input label="Department / ward" value={departmentDraft.name} onChange={(e) => setDepartmentDraft(prev => ({ ...prev, name: e.target.value }))} />
                                    <Input label="Capacity" type="number" value={departmentDraft.capacity} onChange={(e) => setDepartmentDraft(prev => ({ ...prev, capacity: Number(e.target.value || 20) }))} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <select
                                        value={departmentDraft.type}
                                        onChange={(e) => setDepartmentDraft(prev => ({ ...prev, type: e.target.value }))}
                                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-medical-500"
                                    >
                                        <option value="Ward">Ward</option>
                                        <option value="Clinic">Clinic</option>
                                        <option value="ICU">ICU</option>
                                        <option value="Emergency">Emergency</option>
                                        <option value="Surgery">Surgery</option>
                                    </select>
                                    <select
                                        value={departmentDraft.status}
                                        onChange={(e) => setDepartmentDraft(prev => ({ ...prev, status: e.target.value }))}
                                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-medical-500"
                                    >
                                        <option value="active">Active</option>
                                        <option value="maintenance">Maintenance</option>
                                        <option value="closed">Closed</option>
                                    </select>
                                </div>
                                <Button variant="primary" onClick={addDepartment}>Add Department</Button>
                            </div>

                            <div className="mt-5">
                                <DataTable
                                    columns={[
                                        { key: 'name', title: 'Name' },
                                        {
                                            key: 'type',
                                            title: 'Type',
                                            render: (row) => (
                                                <select
                                                    value={row.type}
                                                    onChange={(e) => updateDepartment(row.id, 'type', e.target.value)}
                                                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-medical-500"
                                                >
                                                    <option value="Ward">Ward</option>
                                                    <option value="Clinic">Clinic</option>
                                                    <option value="ICU">ICU</option>
                                                    <option value="Emergency">Emergency</option>
                                                    <option value="Surgery">Surgery</option>
                                                </select>
                                            )
                                        },
                                        {
                                            key: 'capacity',
                                            title: 'Capacity',
                                            render: (row) => (
                                                <input
                                                    type="number"
                                                    value={row.capacity}
                                                    onChange={(e) => updateDepartment(row.id, 'capacity', e.target.value)}
                                                    className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-medical-500"
                                                />
                                            )
                                        },
                                        {
                                            key: 'status',
                                            title: 'Status',
                                            render: (row) => (
                                                <select
                                                    value={row.status}
                                                    onChange={(e) => updateDepartment(row.id, 'status', e.target.value)}
                                                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-medical-500"
                                                >
                                                    <option value="active">Active</option>
                                                    <option value="maintenance">Maintenance</option>
                                                    <option value="closed">Closed</option>
                                                </select>
                                            )
                                        },
                                        {
                                            key: 'actions',
                                            title: 'Actions',
                                            render: (row) => (
                                                <Button variant="ghost" size="sm" onClick={() => removeDepartment(row.id)}>Remove</Button>
                                            )
                                        }
                                    ]}
                                    data={departments}
                                />
                            </div>
                        </Card>

                        <Card title="Backup & Compliance Dashboard">
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    {complianceChecks.map((item) => (
                                        <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                                            <div className="mt-2 flex items-center justify-between gap-3">
                                                <span className="text-lg font-bold text-slate-900">{item.value}</span>
                                                <span className={'rounded-full px-2 py-1 text-[10px] font-semibold ' + (
                                                    item.tone === 'success' ? 'bg-emerald-100 text-emerald-700' :
                                                    item.tone === 'warning' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-blue-100 text-blue-700'
                                                )}>
                                                    {item.tone === 'success' ? 'OK' : item.tone === 'warning' ? 'Review' : 'Info'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-sm font-semibold text-slate-800">Compliance Overview</p>
                                        <span className="text-xs text-slate-500">Overall readiness</span>
                                    </div>
                                    <div className="flex items-end gap-3 h-32">
                                        {complianceChart.map((item) => (
                                            <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
                                                <div className="flex h-24 w-full items-end justify-center">
                                                    <div
                                                        className="w-full rounded-t-xl bg-gradient-to-t from-medical-600 to-emerald-400 shadow-sm"
                                                        style={{ height: `${item.value}%` }}
                                                        title={`${item.label}: ${item.value}%`}
                                                    />
                                                </div>
                                                <span className="text-[10px] text-slate-500">{item.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600">Last successful backup</span>
                                        <span className="font-semibold text-slate-900">{settings.backupSchedule}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600">Encryption in transit</span>
                                        <span className="font-semibold text-slate-900">{settings.encryptionInTransit ? 'Enabled' : 'Disabled'}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600">Annual compliance review</span>
                                        <span className="font-semibold text-slate-900">{settings.annualAuditCycle}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600">Incident response SLA</span>
                                        <span className="font-semibold text-slate-900">{settings.incidentReportingSlaHours} hours</span>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-white p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-sm font-semibold text-slate-800">Export history</p>
                                        <span className="text-xs text-slate-500">Latest 10</span>
                                    </div>
                                    <div className="space-y-2">
                                        {exportHistory.map((entry) => (
                                            <div key={entry.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                                <div>
                                                    <p className="font-medium text-slate-700">{entry.fileName}</p>
                                                    <p className="text-slate-500">{entry.exportType} • {entry.recordCount} records</p>
                                                </div>
                                                <span className="text-slate-500">{formatDateTime(entry.exportedAt)}</span>
                                            </div>
                                        ))}
                                        {!exportHistory.length && <p className="text-xs text-slate-500">No compliance exports have been recorded.</p>}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            );
        };

        // ==========================================
