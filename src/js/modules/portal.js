        // PATIENT PORTAL MODULE
        // ==========================================
        const PatientPortalModule = () => {
            const { user } = useAuth();
            const patientLookupId = user?.patientId || user?.id || null;
            const patient = seedData.patients.find(p => p.id === patientLookupId || p.patientNumber === patientLookupId);
            const [activeTab, setActiveTab] = useState('overview');
            const [messageDraft, setMessageDraft] = useState('');
            const [appointmentDraft, setAppointmentDraft] = useState({
                department: '',
                doctorId: '',
                date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                time: '',
                reason: '',
                visitType: ''
            });
            const [refillDraft, setRefillDraft] = useState({ medication: '', quantity: '30', notes: '' });
            const [portalMessages, setPortalMessages] = useState([]);

            const tabs = [
                { id: 'overview', label: 'Overview' },
                { id: 'appointments', label: 'Appointments' },
                { id: 'lab_results', label: 'Lab Results' },
                { id: 'prescriptions', label: 'Prescriptions' },
                { id: 'billing', label: 'Billing' },
                { id: 'messages', label: 'Messages' },
            ];

            useEffect(() => {
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client || !patient?.id) return;
                client.from('patient_messages').select('*').eq('patient_id', patient.id).order('sent_at').then(({ data, error }) => {
                    if (!error) setPortalMessages((data || []).map((row) => ({ id: row.id, sender: row.sender_name, direction: row.direction, text: row.message, sentAt: row.sent_at })));
                });
            }, [patient?.id]);

            const handleSendMessage = async () => {
                if (!messageDraft.trim()) return;
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client || !patient?.id) return;
                const { data, error } = await client.from('patient_messages').insert({ patient_id: patient.id, sender_name: 'You', direction: 'outgoing', message: messageDraft.trim() }).select();
                if (error || !data?.[0]) return;
                setPortalMessages((current) => [...current, { id: data[0].id, sender: data[0].sender_name, direction: data[0].direction, text: data[0].message, sentAt: data[0].sent_at }]);
                setMessageDraft('');
            };

            const handleBookAppointment = async () => {
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client || !patient?.id || !appointmentDraft.date) return;
                const { error } = await client.from('appointments').insert({ patient_id: patient.id, doctor_id: appointmentDraft.doctorId || null, appointment_date: appointmentDraft.date, appointment_time: appointmentDraft.time, appointment_type: appointmentDraft.visitType || 'portal_request', department: appointmentDraft.department, status: 'requested', notes: appointmentDraft.reason || null });
                if (error) return;
                setAppointmentDraft({
                    department: '',
                    doctorId: '',
                    date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    time: '',
                    reason: '',
                    visitType: ''
                });
                setActiveTab('appointments');
            };

            const handleRequestRefill = async () => {
                if (!refillDraft.medication.trim()) return;
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client || !patient?.id) return;
                const { error } = await client.from('medication_refill_requests').insert({ patient_id: patient.id, medication_name: refillDraft.medication.trim(), quantity: Number(refillDraft.quantity || 0), notes: refillDraft.notes || null });
                if (error) return;
                setRefillDraft({ medication: refillDraft.medication, quantity: refillDraft.quantity, notes: '' });
            };

            if (!patient) {
                return <div className="p-6"><Card title="Patient portal unavailable"><p className="text-slate-600">This account is not linked to a patient record. Ask your care team to link your profile.</p></Card></div>;
            }

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
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate((seedData.appointments || []).filter(a => a.patientId === patient.id).slice(-1)[0]?.date)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Active meds</p>
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{(seedData.medicationOrders || []).filter(m => m.patientId === patient.id && m.status === 'active').length}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Open bills</p>
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{(seedData.billing || []).filter(b => b.patientId === patient.id && Number(b.balance || 0) > 0).length}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Next review</p>
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate((seedData.appointments || []).filter(a => a.patientId === patient.id && a.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date))[0]?.date)}</p>
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
                                        <Select label="Department" value={appointmentDraft.department} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, department: e.target.value }))} options={[{ value: '', label: 'Select department' }, { value: 'medical', label: 'Medical' }, { value: 'surgical', label: 'Surgical' }, { value: 'diagnostic', label: 'Diagnostic' }, { value: 'specialist', label: 'Specialist' }]} />
                                        <Input label="Preferred date" type="date" value={appointmentDraft.date} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, date: e.target.value }))} />
                                        <Input label="Preferred time" type="time" value={appointmentDraft.time} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, time: e.target.value }))} />
                                        <Select label="Visit type" value={appointmentDraft.visitType} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, visitType: e.target.value }))} options={[{ value: '', label: 'Select visit type' }, { value: 'follow_up', label: 'Follow-up' }, { value: 'consultation', label: 'Consultation' }, { value: 'review', label: 'Review' }, { value: 'procedure', label: 'Procedure' }]} />
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
