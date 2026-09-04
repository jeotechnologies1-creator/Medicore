        // ==========================================
        // AUDIT LOGS MODULE
        // ==========================================
        const AuditModule = () => {
            const [filterSeverity, setFilterSeverity] = useState('all');

            const filteredLogs = seedData.auditLogs.filter(log =>
                filterSeverity === 'all' || log.severity === filterSeverity
            );

            const governanceSummary = {
                criticalIncidents: filteredLogs.filter((log) => log.severity === 'critical').length + ((seedData.clinicalAlerts || []).filter(item => item.severity === 'critical').length || 0),
                pendingReviews: Math.max(3, Math.round((seedData.auditLogs.length || 0) * 0.18) + (seedData.clinicalAlerts || []).filter(alert => alert.status === 'open').length),
                complianceRate: 96,
                escalationQueue: 5
            };

            const incidentQueue = [
                { id: 'INC-1042', patient: 'Jane Okafor', area: 'Medication Safety', issue: 'Allergy mismatch on discharge medication', status: 'Escalated', owner: 'Pharmacy Lead', due: '2h' },
                { id: 'INC-1047', patient: 'Daniel Mensah', area: 'Clinical Documentation', issue: 'Discharge note missing signature', status: 'Pending review', owner: 'Ward Nurse', due: '4h' },
                { id: 'INC-1051', patient: 'Grace Bassey', area: 'Lab Follow-up', issue: 'Critical lab result not acknowledged', status: 'Monitoring', owner: 'Lab Manager', due: '1h' },
                { id: 'INC-1058', patient: 'Samuel Adebayo', area: 'Patient ID', issue: 'Verification not completed before procedure', status: 'Escalated', owner: 'Clinical Safety Officer', due: '90m' }
            ];

            const complianceChecks = [
                {
                    title: 'Medication allergy verification',
                    status: ((seedData.allergies || []).length > 0 && (seedData.medicationOrders || []).length > 0) ? 'pass' : 'review',
                    owner: 'Pharmacy QA',
                    nextAction: 'Audit all active medication orders against allergy list.',
                    sla: 'within 24h'
                },
                {
                    title: 'Critical lab result acknowledgment',
                    status: (seedData.labOrders || []).some(item => item.status === 'critical') ? 'escalate' : 'pass',
                    owner: 'Lab Services',
                    nextAction: 'Confirm acknowledgment and escalation within SLA.',
                    sla: 'within 30 min'
                },
                {
                    title: 'Consent and discharge documentation',
                    status: (seedData.documents || []).some(item => item.documentType && item.documentType.toLowerCase().includes('discharge')) ? 'pass' : 'review',
                    owner: 'Clinical Governance',
                    nextAction: 'Ensure all discharge summaries include instruction and consent capture.',
                    sla: 'within 4h'
                }
            ];
            const escalationQueue = [
                { id: 'EC-2', patient: 'Daniel Adebayo', area: 'Medication safety', due: '18m', owner: 'Pharmacy lead' },
                { id: 'EC-7', patient: 'Grace Bassey', area: 'Critical lab follow-up', due: '42m', owner: 'Lab manager' },
                { id: 'EC-9', patient: 'Samuel Adebayo', area: 'Consent capture', due: '1h 15m', owner: 'Clinical governance' }
            ];

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
                            {complianceChecks.map((check) => (
                                <div key={check.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="font-medium text-slate-900">{check.title}</p>
                                        <Badge variant={check.status === 'pass' ? 'success' : check.status === 'escalate' ? 'danger' : 'warning'}>{check.status}</Badge>
                                    </div>
                                    <p className="mt-3 text-xs text-slate-500">Owner: {check.owner}</p>
                                    <p className="mt-2 text-sm text-slate-700">{check.nextAction}</p>
                                    <p className="mt-2 text-xs text-medical-600">SLA: {check.sla}</p>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card title="Escalation queue">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {escalationQueue.map((item) => (
                                <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs uppercase tracking-wide text-slate-500">{item.id}</p>
                                        <Badge variant="danger">Due {item.due}</Badge>
                                    </div>
                                    <p className="mt-3 font-semibold text-slate-900">{item.patient}</p>
                                    <p className="mt-1 text-sm text-slate-600">{item.area}</p>
                                    <p className="mt-3 text-xs text-slate-500">Owner: {item.owner}</p>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card title="Clinical governance board">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {incidentQueue.map((incident) => (
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
                                        <span>Due in {incident.due}</span>
                                    </div>
                                </div>
                            ))}
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
                                    const user = seedData.users.find(u => u.id === row.userId);
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
            const compliancePolicies = [
                { title: 'Clinical documentation retention', owner: 'Medical Records', status: 'Active', updated: '2026-08-28', version: 'v3.4' },
                { title: 'Medication safety policy', owner: 'Pharmacy QA', status: 'Reviewed', updated: '2026-08-20', version: 'v2.1' },
                { title: 'Patient consent governance', owner: 'Compliance Office', status: 'Active', updated: '2026-08-18', version: 'v1.8' },
                { title: 'Critical lab escalation protocol', owner: 'Lab Services', status: 'Pending review', updated: '2026-08-12', version: 'v4.0' }
            ];

            const files = [
                { name: 'HIPAA Privacy Notice.pdf', category: 'Privacy', owner: 'Compliance', updated: '2026-09-01', status: 'Approved' },
                { name: 'Medication Error Reporting SOP.docx', category: 'Safety', owner: 'Clinical Safety', updated: '2026-08-29', status: 'Reviewed' },
                { name: 'Incident Escalation Matrix.xlsx', category: 'Governance', owner: 'Operations', updated: '2026-08-26', status: 'Approved' }
            ];

            const automationSummary = [
                { label: 'High-risk events', value: (seedData.clinicalAlerts || []).filter(item => item.severity === 'critical').length },
                { label: 'Open incidents', value: (seedData.clinicalAlerts || []).filter(item => item.status === 'open').length },
                { label: 'Records to review', value: Math.max(2, (seedData.auditLogs || []).length / 2) },
                { label: 'Retention coverage', value: '98%' }
            ];

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Compliance Vault</h2>
                            <p className="text-slate-500 mt-1">Document control, policy access, and governance oversight</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" icon={Icons.Upload}>Upload Policy</Button>
                            <Button variant="primary" icon={Icons.FileText}>New Review</Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Active Policies" value="42" icon={Icons.ShieldCheck} color="emerald" />
                        <StatCard title="Pending Reviews" value="6" icon={Icons.AlertCircle} color="amber" />
                        <StatCard title="Documents" value="168" icon={Icons.FileText} color="medical" />
                        <StatCard title="Compliance Rate" value="96%" icon={Icons.BarChart3} color="violet" />
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
                        <Card title="Policy register">
                            <div className="space-y-3">
                                {compliancePolicies.map((policy) => (
                                    <div key={policy.title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="font-medium text-slate-900">{policy.title}</p>
                                                <p className="text-xs text-slate-500">Owner: {policy.owner}</p>
                                            </div>
                                            <Badge variant={policy.status === 'Active' ? 'success' : policy.status === 'Reviewed' ? 'info' : policy.status === 'Pending review' ? 'warning' : 'default'}>{policy.status}</Badge>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                                            <span>Updated {policy.updated}</span>
                                            <span>Version {policy.version}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card title="Document repository">
                            <DataTable
                                columns={[
                                    { key: 'name', title: 'Document' },
                                    { key: 'category', title: 'Category' },
                                    { key: 'owner', title: 'Owner' },
                                    { key: 'updated', title: 'Updated' },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'Approved' ? 'success' : row.status === 'Reviewed' ? 'info' : 'warning'}>{row.status}</Badge> }
                                ]}
                                data={files}
                                actions={() => (
                                    <Button variant="ghost" size="sm" icon={Icons.Eye}>View</Button>
                                )}
                            />
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
                facilityName: 'MediCore Hospital',
                facilityCode: 'MC-001',
                timezone: 'UTC',
                locale: 'en-US',
                currency: 'USD',
                contactEmail: '',
                phone: '+1 (800) 555-0147',
                serviceLine: 'General Hospital & Outpatient Clinics',
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
                }
            ];

            const initialDepartments = (seedData.wards || []).map((ward, index) => ({
                id: ward.id || `dept-${index + 1}`,
                name: ward.name || `Ward ${index + 1}`,
                type: ward.type || 'Ward',
                capacity: ward.capacity || 20,
                status: ward.status || 'active'
            }));

            const [settings, setSettings] = useState(() => {
                try {
                    const saved = JSON.parse(localStorage.getItem('medicore_settings') || '{}');
                    return { ...defaultSettings, ...saved };
                } catch (e) {
                    return defaultSettings;
                }
            });
            const [saveMessage, setSaveMessage] = useState('');
            const [roleMatrix, setRoleMatrix] = useState(() => {
                try {
                    const saved = JSON.parse(localStorage.getItem('medicore_role_matrix') || '[]');
                    if (Array.isArray(saved) && saved.length) {
                        return saved.map((row) => ({
                            ...row,
                            permissions: {
                                ...row.permissions,
                                dashboard: row.permissions?.dashboard ?? true,
                                patients: row.permissions?.patients ?? false,
                                appointments: row.permissions?.appointments ?? row.permissions?.appointment ?? false,
                                doctors: row.permissions?.doctors ?? row.permissions?.doctor ?? false,
                                laboratory: row.permissions?.laboratory ?? row.permissions?.labs ?? row.permissions?.lab ?? false,
                                radiology: row.permissions?.radiology ?? row.permissions?.imaging ?? false,
                                pharmacy: row.permissions?.pharmacy ?? row.permissions?.medications ?? false,
                                billing: row.permissions?.billing ?? false,
                                insurance: row.permissions?.insurance ?? row.permissions?.insurance_claims ?? row.permissions?.claims ?? false,
                                payments: row.permissions?.payments ?? row.permissions?.payment ?? false,
                                documents: row.permissions?.documents ?? row.permissions?.document_control ?? row.permissions?.clinical_documents ?? false,
                                compliance: row.permissions?.compliance ?? row.permissions?.governance ?? row.permissions?.policy_library ?? false,
                                admissions: row.permissions?.admissions ?? row.permissions?.admission ?? row.permissions?.ward ?? false,
                                surgeries: row.permissions?.surgeries ?? row.permissions?.surgery ?? false,
                                clinical_safety: row.permissions?.clinical_safety ?? row.permissions?.safety ?? false,
                                inventory: row.permissions?.inventory ?? row.permissions?.stock ?? false,
                                hr: row.permissions?.hr ?? row.permissions?.staff ?? row.permissions?.human_resources ?? false,
                                offices: row.permissions?.offices ?? row.permissions?.medical_offices ?? row.permissions?.office ?? false,
                                reports: row.permissions?.reports ?? row.permissions?.report ?? false,
                                audit: row.permissions?.audit ?? row.permissions?.audit_logs ?? false,
                                settings: row.permissions?.settings ?? row.permissions?.system_settings ?? false
                            }
                        }));
                    }
                } catch (e) {}
                return initialRoleMatrix;
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
                        if (window.MedicoreSupabase && typeof window.MedicoreSupabase.loadSystemSettings === 'function') {
                            const remoteSettings = await window.MedicoreSupabase.loadSystemSettings();
                            if (remoteSettings && Object.keys(remoteSettings).length) {
                                const { roleMatrix: remoteRoleMatrix, ...remoteOnlySettings } = remoteSettings;
                                setSettings(prev => ({ ...prev, ...remoteOnlySettings }));
                                if (Array.isArray(remoteRoleMatrix) && remoteRoleMatrix.length) {
                                    setRoleMatrix(remoteRoleMatrix);
                                    localStorage.setItem('medicore_role_matrix', JSON.stringify(remoteRoleMatrix));
                                }
                            }
                        }
                        if (window.MedicoreSupabase && typeof window.MedicoreSupabase.loadDepartments === 'function') {
                            const remoteDepartments = await window.MedicoreSupabase.loadDepartments();
                            if (remoteDepartments && remoteDepartments.length) {
                                setDepartments(remoteDepartments);
                            }
                        }
                        if (window.MedicoreSupabase && typeof window.MedicoreSupabase.loadComplianceExports === 'function') {
                            const remoteExports = await window.MedicoreSupabase.loadComplianceExports();
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

            const saveSettings = async () => {
                try {
                    const cleanedMatrix = roleMatrix.map((row) => ({
                        ...row,
                        permissions: {
                            ...row.permissions,
                            dashboard: row.permissions?.dashboard ?? true,
                            patients: row.permissions?.patients ?? false,
                            appointments: row.permissions?.appointments ?? row.permissions?.appointment ?? false,
                            doctors: row.permissions?.doctors ?? row.permissions?.doctor ?? false,
                            laboratory: row.permissions?.laboratory ?? row.permissions?.labs ?? row.permissions?.lab ?? false,
                            radiology: row.permissions?.radiology ?? row.permissions?.imaging ?? false,
                            pharmacy: row.permissions?.pharmacy ?? row.permissions?.medications ?? false,
                            billing: row.permissions?.billing ?? false,
                            insurance: row.permissions?.insurance ?? row.permissions?.insurance_claims ?? row.permissions?.claims ?? false,
                            payments: row.permissions?.payments ?? row.permissions?.payment ?? false,
                            documents: row.permissions?.documents ?? row.permissions?.document_control ?? row.permissions?.clinical_documents ?? false,
                            compliance: row.permissions?.compliance ?? row.permissions?.governance ?? row.permissions?.policy_library ?? false,
                            admissions: row.permissions?.admissions ?? row.permissions?.admission ?? row.permissions?.ward ?? false,
                            surgeries: row.permissions?.surgeries ?? row.permissions?.surgery ?? false,
                            clinical_safety: row.permissions?.clinical_safety ?? row.permissions?.safety ?? false,
                            inventory: row.permissions?.inventory ?? row.permissions?.stock ?? false,
                            hr: row.permissions?.hr ?? row.permissions?.staff ?? row.permissions?.human_resources ?? false,
                            offices: row.permissions?.offices ?? row.permissions?.medical_offices ?? row.permissions?.office ?? false,
                            reports: row.permissions?.reports ?? row.permissions?.report ?? false,
                            audit: row.permissions?.audit ?? row.permissions?.audit_logs ?? false,
                            settings: row.permissions?.settings ?? row.permissions?.system_settings ?? false
                        }
                    }));
                    setRoleMatrix(cleanedMatrix);
                    localStorage.setItem('medicore_settings', JSON.stringify(settings));
                    localStorage.setItem('medicore_role_matrix', JSON.stringify(cleanedMatrix));
                    if (window.MedicoreSupabase && typeof window.MedicoreSupabase.saveSystemSettings === 'function') {
                        const { error } = await window.MedicoreSupabase.saveSystemSettings(settings, cleanedMatrix);
                        if (error) {
                            setSaveMessage('Settings saved locally; Supabase sync failed.');
                            return;
                        }
                    }
                    setSaveMessage('Settings and role matrix saved successfully.');
                } catch (e) {
                    setSaveMessage('Unable to save settings in this browser session.');
                }
            };

            const resetSettings = async () => {
                setSettings(defaultSettings);
                setRoleMatrix(initialRoleMatrix);
                setDepartments(initialDepartments);
                try {
                    localStorage.setItem('medicore_settings', JSON.stringify(defaultSettings));
                    localStorage.setItem('medicore_role_matrix', JSON.stringify(initialRoleMatrix));
                    if (window.MedicoreSupabase && typeof window.MedicoreSupabase.saveSystemSettings === 'function') {
                        await window.MedicoreSupabase.saveSystemSettings(defaultSettings, initialRoleMatrix);
                    }
                    setSaveMessage('Default EMR settings restored.');
                } catch (e) {
                    setSaveMessage('Default settings restored locally.');
                }
            };

            const togglePermission = (roleName, permissionKey) => {
                const canonicalKey = permissionAliases[permissionKey] || permissionKey;
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
                    localStorage.setItem('medicore_role_matrix', JSON.stringify(next));
                    return next;
                });
            };

            const addDepartment = async () => {
                const trimmedName = departmentDraft.name.trim();
                if (!trimmedName) {
                    setSaveMessage('Department name is required before creating a unit.');
                    return;
                }

                const newDepartment = {
                    id: `dept-${Date.now()}`,
                    name: trimmedName,
                    type: departmentDraft.type,
                    capacity: Number(departmentDraft.capacity || 20),
                    status: departmentDraft.status,
                    occupied: 0
                };

                const nextDepartments = [...departments, newDepartment];
                setDepartments(nextDepartments);
                setDepartmentDraft({ name: '', type: 'Ward', capacity: 20, status: 'active' });

                try {
                    if (window.MedicoreSupabase && typeof window.MedicoreSupabase.saveDepartments === 'function') {
                        await window.MedicoreSupabase.saveDepartments(nextDepartments);
                    }
                    setSaveMessage('Department/ward added successfully.');
                } catch (e) {
                    setSaveMessage('Department saved locally, but Supabase sync failed.');
                }
            };

            const updateDepartment = async (id, field, value) => {
                const nextDepartments = departments.map(item =>
                    item.id === id ? { ...item, [field]: field === 'capacity' ? Number(value || 0) : value } : item
                );
                setDepartments(nextDepartments);

                try {
                    if (window.MedicoreSupabase && typeof window.MedicoreSupabase.saveDepartments === 'function') {
                        await window.MedicoreSupabase.saveDepartments(nextDepartments);
                    }
                } catch (e) {
                    console.warn('Department sync failed:', e);
                }
            };

            const removeDepartment = async (id) => {
                const nextDepartments = departments.filter(item => item.id !== id);
                setDepartments(nextDepartments);
                try {
                    if (window.MedicoreSupabase && typeof window.MedicoreSupabase.saveDepartments === 'function') {
                        await window.MedicoreSupabase.saveDepartments(nextDepartments);
                    }
                    setSaveMessage('Department removed from the configuration.');
                } catch (e) {
                    setSaveMessage('Department removed locally but not persisted to Supabase.');
                }
            };

            const handleAuditExport = async () => {
                const headers = ['timestamp', 'userId', 'action', 'entityType', 'severity', 'ipAddress'];
                const rows = seedData.auditLogs.map((log) => [
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
                link.download = 'medicore-audit-export.csv';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                try {
                    if (window.MedicoreSupabase && typeof window.MedicoreSupabase.recordComplianceExport === 'function') {
                        const result = await window.MedicoreSupabase.recordComplianceExport('audit_csv', 'medicore-audit-export.csv', rows.length, {
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

            const permissionAliases = {
                labs: 'laboratory',
                lab: 'laboratory',
                pharmacy: 'pharmacy',
                billing: 'billing',
                settings: 'settings',
                patients: 'patients',
                dashboard: 'dashboard'
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
                { label: 'Backups', value: settings.enableAutoBackups ? 92 : 35 },
                { label: 'Security', value: settings.requireMfa ? 95 : 60 },
                { label: 'Retention', value: Math.min(100, Math.round((settings.auditRetentionDays / 3650) * 100)) },
                { label: 'Interoperability', value: settings.enableFhir ? 90 : 68 }
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
                                    {
                                        key: 'dashboard',
                                        title: 'Dashboard',
                                        render: (row) => (
                                            <input
                                                type="checkbox"
                                                checked={row.permissions.dashboard}
                                                onChange={() => togglePermission(row.role, 'dashboard')}
                                                className="h-4 w-4 rounded border-slate-300 text-medical-600 focus:ring-medical-500"
                                            />
                                        )
                                    },
                                    {
                                        key: 'patients',
                                        title: 'Patients',
                                        render: (row) => (
                                            <input
                                                type="checkbox"
                                                checked={row.permissions.patients}
                                                onChange={() => togglePermission(row.role, 'patients')}
                                                className="h-4 w-4 rounded border-slate-300 text-medical-600 focus:ring-medical-500"
                                            />
                                        )
                                    },
                                    {
                                        key: 'billing',
                                        title: 'Billing',
                                        render: (row) => (
                                            <input
                                                type="checkbox"
                                                checked={row.permissions.billing}
                                                onChange={() => togglePermission(row.role, 'billing')}
                                                className="h-4 w-4 rounded border-slate-300 text-medical-600 focus:ring-medical-500"
                                            />
                                        )
                                    },
                                    {
                                        key: 'pharmacy',
                                        title: 'Pharmacy',
                                        render: (row) => (
                                            <input
                                                type="checkbox"
                                                checked={row.permissions.pharmacy}
                                                onChange={() => togglePermission(row.role, 'pharmacy')}
                                                className="h-4 w-4 rounded border-slate-300 text-medical-600 focus:ring-medical-500"
                                            />
                                        )
                                    },
                                    {
                                        key: 'laboratory',
                                        title: 'Labs',
                                        render: (row) => (
                                            <input
                                                type="checkbox"
                                                checked={row.permissions.laboratory ?? row.permissions.labs ?? false}
                                                onChange={() => togglePermission(row.role, 'laboratory')}
                                                className="h-4 w-4 rounded border-slate-300 text-medical-600 focus:ring-medical-500"
                                            />
                                        )
                                    },
                                    {
                                        key: 'settings',
                                        title: 'Settings',
                                        render: (row) => (
                                            <input
                                                type="checkbox"
                                                checked={row.permissions.settings}
                                                onChange={() => togglePermission(row.role, 'settings')}
                                                className="h-4 w-4 rounded border-slate-300 text-medical-600 focus:ring-medical-500"
                                            />
                                        )
                                    }
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
