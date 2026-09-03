        // PATIENT PORTAL MODULE
        // ==========================================
        const PatientPortalModule = () => {
            const { user } = useAuth();
            const patient = seedData.patients.find(p => p.patientId === user?.patientId) || seedData.patients[0];
            const [activeTab, setActiveTab] = useState('overview');

            const tabs = [
                { id: 'overview', label: 'Overview' },
                { id: 'appointments', label: 'Appointments' },
                { id: 'lab_results', label: 'Lab Results' },
                { id: 'prescriptions', label: 'Prescriptions' },
                { id: 'billing', label: 'Billing' },
                { id: 'messages', label: 'Messages' },
            ];

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
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.Calendar}>Book Appointment</Button>
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.MessageSquare}>Message Doctor</Button>
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.Download}>Download Records</Button>
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.CreditCard}>Pay Bill</Button>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {activeTab === 'appointments' && (
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
                                        { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                        { key: 'diagnosis', title: 'Diagnosis' },
                                        { key: 'medications', title: 'Medications', render: (row) => row.medications.map(m => m.name).join(', ') },
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
                                        { key: 'action', title: 'Action', render: () => <span className="text-slate-500 text-sm">No online payment</span> }
                                    ]}
                                    data={seedData.billing.filter(b => b.patientId === patient.id)}
                                />
                            </Card>
                        )}

                        {activeTab === 'messages' && (
                            <Card title="Messages">
                                <div className="space-y-4">
                                    <div className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                                        <Avatar name="Dr. Smith" size="sm" />
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <p className="font-medium text-sm">Dr. Sarah Smith</p>
                                                <span className="text-xs text-slate-400">2 hours ago</span>
                                            </div>
                                            <p className="text-sm text-slate-600 mt-1">Your lab results are ready. Please schedule a follow-up appointment to discuss the findings.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <textarea
                                            placeholder="Type your message..."
                                            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm resize-none"
                                            rows={3}
                                        />
                                        <Button variant="primary" icon={Icons.Send} className="self-end">Send</Button>
                                    </div>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            );
        };

        // ==========================================
