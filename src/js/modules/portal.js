        // PATIENT PORTAL MODULE
        // ==========================================
        const PatientPortalModule = () => {
            const { user } = useAuth();
            const patientLookupId = user?.patientId || user?.id || null;
            const patient = seedData.patients.find(p => p.id === patientLookupId || p.patientNumber === patientLookupId) || seedData.patients[0];
            const [activeTab, setActiveTab] = useState('overview');
            const [messageDraft, setMessageDraft] = useState('');
            const [appointmentDraft, setAppointmentDraft] = useState({
                department: 'General Medicine',
                doctorId: 'user-doctor-1',
                date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                time: '10:30',
                reason: '',
                visitType: 'Follow-up'
            });
            const [refillDraft, setRefillDraft] = useState({ medication: 'Atorvastatin 20mg', quantity: '30', notes: '' });
            const messageKey = `medicore_portal_messages_${patient?.id || 'anonymous'}`;
            const [portalMessages, setPortalMessages] = useState(() => {
                try {
                    const raw = localStorage.getItem(messageKey);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed) && parsed.length) return parsed;
                    }
                } catch (e) {}
                return [
                    { id: 'msg-1', sender: 'Dr. Sarah Smith', direction: 'incoming', text: 'Your lab results are ready. Please schedule a follow-up appointment to discuss the findings.', sentAt: '2026-09-03T10:15:00Z' },
                    { id: 'msg-2', sender: 'You', direction: 'outgoing', text: 'Thank you. I will book a follow-up next week.', sentAt: '2026-09-03T10:20:00Z' }
                ];
            });

            const tabs = [
                { id: 'overview', label: 'Overview' },
                { id: 'appointments', label: 'Appointments' },
                { id: 'lab_results', label: 'Lab Results' },
                { id: 'prescriptions', label: 'Prescriptions' },
                { id: 'billing', label: 'Billing' },
                { id: 'messages', label: 'Messages' },
            ];

            useEffect(() => {
                try {
                    localStorage.setItem(messageKey, JSON.stringify(portalMessages));
                } catch (e) {}
            }, [portalMessages, messageKey]);

            const handleSendMessage = () => {
                if (!messageDraft.trim()) return;
                const next = [
                    ...portalMessages,
                    { id: 'msg-' + Date.now(), sender: 'You', direction: 'outgoing', text: messageDraft.trim(), sentAt: new Date().toISOString() }
                ];
                setPortalMessages(next);
                try {
                    localStorage.setItem(messageKey, JSON.stringify(next));
                } catch (e) {}
                persistSeedTable('auditLogs', [
                    ...((seedData.auditLogs || [])),
                    { id: 'audit-' + Date.now(), userId: patient.id, action: 'Portal message sent', entityType: 'patient_message', entityId: patient.id, timestamp: new Date().toISOString(), severity: 'info' }
                ]);
                setMessageDraft('');
            };

            const handleBookAppointment = () => {
                const nextBooking = {
                    id: 'apt_' + Date.now(),
                    patientId: patient.id,
                    doctorId: appointmentDraft.doctorId,
                    date: appointmentDraft.date,
                    time: appointmentDraft.time,
                    type: appointmentDraft.visitType || 'portal_request',
                    department: appointmentDraft.department,
                    status: 'scheduled',
                    notes: appointmentDraft.reason || 'Requested through patient portal',
                    createdAt: new Date().toISOString()
                };
                const next = [nextBooking, ...(seedData.appointments || [])];
                persistSeedTable('appointments', next);
                seedData.appointments = next;
                persistSeedTable('auditLogs', [
                    ...((seedData.auditLogs || [])),
                    { id: 'audit-' + Date.now(), userId: patient.id, action: 'Portal appointment requested', entityType: 'appointment', entityId: nextBooking.id, timestamp: new Date().toISOString(), severity: 'info' }
                ]);
                setAppointmentDraft({
                    department: 'General Medicine',
                    doctorId: 'user-doctor-1',
                    date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    time: '10:30',
                    reason: '',
                    visitType: 'Follow-up'
                });
                setActiveTab('appointments');
            };

            const handleRequestRefill = () => {
                if (!refillDraft.medication.trim()) return;
                const refillEntry = {
                    id: 'refill_' + Date.now(),
                    patientId: patient.id,
                    medication: refillDraft.medication,
                    quantity: refillDraft.quantity || '30',
                    notes: refillDraft.notes || 'Requested via patient portal',
                    status: 'pending_review',
                    createdAt: new Date().toISOString()
                };
                const next = [refillEntry, ...((seedData.prescriptions || []).filter((item) => item.patientId !== patient.id || !item._portalRefill))];
                persistSeedTable('prescriptions', next);
                seedData.prescriptions = next;
                persistSeedTable('auditLogs', [
                    ...((seedData.auditLogs || [])),
                    { id: 'audit-' + Date.now(), userId: patient.id, action: 'Medication refill requested', entityType: 'prescription', entityId: refillEntry.id, timestamp: new Date().toISOString(), severity: 'info' }
                ]);
                setRefillDraft({ medication: refillDraft.medication, quantity: refillDraft.quantity, notes: '' });
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center gap-4 mb-6">
                        <Avatar name={patient.firstName + ' ' + patient.lastName} size="xl" />
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Welcome, {patient.firstName}</h2>
                            <p className="text-slate-500">Patient ID: {patient.patientNumber}</p>
                        </div>
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    <div className="mt-6">
                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <Card title="My Information" className="lg:col-span-2">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><p className="text-xs text-slate-500">Full Name</p><p className="font-medium">{patient.firstName} {patient.lastName}</p></div>
                                        <div><p className="text-xs text-slate-500">Date of Birth</p><p className="font-medium">{formatDate(patient.dateOfBirth)}</p></div>
                                        <div><p className="text-xs text-slate-500">Blood Group</p><p className="font-medium">{patient.bloodGroup}</p></div>
                                        <div><p className="text-xs text-slate-500">Phone</p><p className="font-medium">{patient.phone}</p></div>
                                        <div><p className="text-xs text-slate-500">Email</p><p className="font-medium">{patient.email}</p></div>
                                        <div><p className="text-xs text-slate-500">Address</p><p className="font-medium">{patient.address}</p></div>
                                    </div>
                                </Card>
                                <Card title="Quick Links">
                                    <div className="space-y-2">
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.Calendar} onClick={() => setActiveTab('appointments')}>Book Appointment</Button>
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.MessageSquare} onClick={() => setActiveTab('messages')}>Message Doctor</Button>
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.Download}>Download Records</Button>
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.CreditCard} onClick={() => setActiveTab('billing')}>Pay Bill</Button>
                                    </div>
                                </Card>
                                <Card title="Medication refill request" className="lg:col-span-3">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <Input label="Medication" value={refillDraft.medication} onChange={(e) => setRefillDraft(prev => ({ ...prev, medication: e.target.value }))} />
                                        <Input label="Quantity" value={refillDraft.quantity} onChange={(e) => setRefillDraft(prev => ({ ...prev, quantity: e.target.value }))} />
                                        <Input label="Notes" value={refillDraft.notes} onChange={(e) => setRefillDraft(prev => ({ ...prev, notes: e.target.value }))} />
                                    </div>
                                    <div className="mt-4 flex justify-end">
                                        <Button variant="primary" icon={Icons.Pill} onClick={handleRequestRefill}>Request refill</Button>
                                    </div>
                                </Card>
                                <Card title="Care summary" className="lg:col-span-3">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Last visit</p>
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate((seedData.appointments || []).filter(a => a.patientId === patient.id).slice(-1)[0]?.date || new Date().toISOString())}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Active meds</p>
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{(seedData.medicationOrders || []).filter(m => m.patientId === patient.id && m.status === 'active').length || 1}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Open bills</p>
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{(seedData.billing || []).filter(b => b.patientId === patient.id && Number(b.balance || 0) > 0).length}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Next review</p>
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate(patient.registrationDate)}</p>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {activeTab === 'appointments' && (
                            <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-6">
                                <Card>
                                    <DataTable
                                        columns={[
                                            { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                            { key: 'time', title: 'Time' },
                                            { key: 'type', title: 'Type' },
                                            { key: 'department', title: 'Department' },
                                            { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'scheduled' ? 'info' : 'default'}>{row.status}</Badge> }
                                        ]}
                                        data={seedData.appointments.filter(a => a.patientId === patient.id)}
                                    />
                                </Card>
                                <Card title="Request appointment">
                                    <div className="space-y-3">
                                        <Select label="Department" value={appointmentDraft.department} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, department: e.target.value }))} options={[{ value: 'General Medicine', label: 'General Medicine' }, { value: 'Cardiology', label: 'Cardiology' }, { value: 'Pulmonology', label: 'Pulmonology' }, { value: 'Endocrinology', label: 'Endocrinology' }]} />
                                        <Input label="Preferred date" type="date" value={appointmentDraft.date} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, date: e.target.value }))} />
                                        <Input label="Preferred time" type="time" value={appointmentDraft.time} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, time: e.target.value }))} />
                                        <Select label="Visit type" value={appointmentDraft.visitType} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, visitType: e.target.value }))} options={[{ value: 'Follow-up', label: 'Follow-up' }, { value: 'Consultation', label: 'Consultation' }, { value: 'Procedure review', label: 'Procedure review' }, { value: 'Medication review', label: 'Medication review' }]} />
                                        <Input label="Reason" value={appointmentDraft.reason} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, reason: e.target.value }))} />
                                        <Button variant="primary" icon={Icons.Calendar} onClick={handleBookAppointment}>Submit request</Button>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {activeTab === 'lab_results' && (
                            <Card>
                                <DataTable
                                    columns={[
                                        { key: 'testType', title: 'Test' },
                                        { key: 'category', title: 'Category' },
                                        { key: 'orderedDate', title: 'Date', render: (row) => formatDate(row.orderedDate) },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : 'warning'}>{row.status}</Badge> },
                                        { key: 'results', title: 'Results', render: (row) => row.results ? <Button variant="primary" size="sm">View</Button> : 'Pending' }
                                    ]}
                                    data={seedData.labOrders.filter(l => l.patientId === patient.id)}
                                />
                            </Card>
                        )}

                        {activeTab === 'prescriptions' && (
                            <Card>
                                <DataTable
                                    columns={[
                                        { key: 'date', title: 'Date', render: (row) => formatDate(row.prescriptionDate || row.date) },
                                        { key: 'diagnosis', title: 'Diagnosis' },
                                        { key: 'medications', title: 'Medications', render: (row) => (row.medications || []).map(m => m.name || m.medicationName).join(', ') },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge> }
                                    ]}
                                    data={seedData.prescriptions.filter(p => p.patientId === patient.id)}
                                />
                            </Card>
                        )}

                        {activeTab === 'billing' && (
                            <Card>
                                <DataTable
                                    columns={[
                                        { key: 'invoiceNumber', title: 'Invoice' },
                                        { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                        { key: 'total', title: 'Total', render: (row) => formatCurrency(row.total) },
                                        { key: 'balance', title: 'Balance', render: (row) => formatCurrency(row.balance) },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'paid' ? 'success' : 'warning'}>{row.status}</Badge> },
                                        { key: 'action', title: 'Action', render: () => <span className="text-slate-500 text-sm">Portal payment available in cashier</span> }
                                    ]}
                                    data={seedData.billing.filter(b => b.patientId === patient.id)}
                                />
                            </Card>
                        )}

                        {activeTab === 'messages' && (
                            <Card title="Messages">
                                <div className="space-y-4">
                                    {portalMessages.map((message) => (
                                        <div key={message.id} className={`flex gap-3 p-3 rounded-lg ${message.direction === 'outgoing' ? 'bg-medical-50 ml-8' : 'bg-slate-50 mr-8'}`}>
                                            <Avatar name={message.sender} size="sm" />
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between">
                                                    <p className="font-medium text-sm">{message.sender}</p>
                                                    <span className="text-xs text-slate-400">{new Date(message.sentAt).toLocaleString()}</span>
                                                </div>
                                                <p className="text-sm text-slate-600 mt-1">{message.text}</p>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex gap-3">
                                        <textarea
                                            value={messageDraft}
                                            onChange={(e) => setMessageDraft(e.target.value)}
                                            placeholder="Type your message..."
                                            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm resize-none"
                                            rows={3}
                                        />
                                        <Button variant="primary" icon={Icons.Send} className="self-end" onClick={handleSendMessage}>Send</Button>
                                    </div>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            );
        };

        // ==========================================
