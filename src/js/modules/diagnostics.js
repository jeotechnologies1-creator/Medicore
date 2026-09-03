        // ==========================================
        const AppointmentsModule = () => {
            const [view, setView] = useState('list');
            const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
            const [showNewAppointment, setShowNewAppointment] = useState(false);
            const [saveError, setSaveError] = useState('');
            const [appointments, setAppointments] = useState(hydrateSeedData().appointments || []);
            const [appointmentForm, setAppointmentForm] = useState({
                patientId: '',
                doctorId: '',
                date: new Date().toISOString().slice(0, 10),
                time: '09:00',
                type: 'consultation',
                department: 'general',
                notes: ''
            });

            const filteredAppointments = (appointments || []).filter(a => a.date === selectedDate);

            const handleScheduleAppointment = async () => {
                if (!appointmentForm.patientId) return;
                setSaveError('');
                const payload = {
                    id: 'apt_' + Date.now(),
                    patientId: appointmentForm.patientId,
                    doctorId: appointmentForm.doctorId,
                    date: appointmentForm.date,
                    time: appointmentForm.time,
                    type: appointmentForm.type,
                    status: 'scheduled',
                    department: appointmentForm.department,
                    notes: appointmentForm.notes || '',
                    createdAt: new Date().toISOString()
                };
                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                if (client) {
                    const { data, error } = await client.from('appointments').insert([{ ...payload, patient_id: payload.patientId, doctor_id: payload.doctorId || null, appointment_date: payload.date, appointment_time: payload.time, appointment_type: payload.type }]).select();
                    if (!error && data && data[0]) {
                        const mapped = {
                            ...payload,
                            id: data[0].id || payload.id,
                            patientId: data[0].patient_id || payload.patientId,
                            doctorId: data[0].doctor_id || payload.doctorId,
                            date: data[0].appointment_date || payload.date,
                            time: data[0].appointment_time || payload.time,
                            type: data[0].appointment_type || payload.type,
                            department: data[0].department || payload.department,
                            notes: data[0].notes || payload.notes
                        };
                        const next = [...appointments, mapped];
                        persistSeedTable('appointments', next);
                        setAppointments(next);
                        setShowNewAppointment(false);
                        return;
                    }
                    setSaveError(error?.message || 'The appointment could not be saved.');
                    return;
                }
                setSaveError('Supabase is not configured. No appointment was created.');
            };

            const handleCheckIn = async (appointment) => {
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) { setSaveError('Supabase is not configured.'); return; }
                const { error } = await client.from('appointments').update({ status: 'checked_in' }).eq('id', appointment.id);
                if (error) { setSaveError(error.message); return; }
                const next = appointments.map(item => item.id === appointment.id ? { ...item, status: 'checked_in' } : item);
                persistSeedTable('appointments', next);
                setAppointments(next);
            };

            const timeSlots = Array.from({ length: 24 }, (_, i) => {
                const hour = String(i).padStart(2, '0');
                return hour + ':00';
            });

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Appointments</h2>
                            <p className="text-slate-500 mt-1">Schedule and manage patient appointments</p>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex bg-slate-100 rounded-lg p-1">
                                <button onClick={() => setView('list')} className={'px-3 py-1.5 rounded-md text-sm font-medium transition-colors ' + (view === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>List</button>
                                <button onClick={() => setView('calendar')} className={'px-3 py-1.5 rounded-md text-sm font-medium transition-colors ' + (view === 'calendar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>Calendar</button>
                            </div>
                            <Button variant="primary" icon={Icons.Plus} onClick={() => setShowNewAppointment(true)}>New Appointment</Button>
                        </div>
                    </div>

                    <Card>
                        <div className="flex items-center gap-4 mb-6">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                            <div className="flex gap-2">
                                <Badge variant="info">Scheduled: {filteredAppointments.filter(a => a.status === 'scheduled').length}</Badge>
                                <Badge variant="success">Completed: {filteredAppointments.filter(a => a.status === 'completed').length}</Badge>
                                <Badge variant="warning">In Progress: {filteredAppointments.filter(a => a.status === 'in-progress').length}</Badge>
                            </div>
                        </div>

                        {view === 'list' ? (
                            <DataTable
                                columns={[
                                    { key: 'time', title: 'Time' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return (
                                            <div className="flex items-center gap-2">
                                                <Avatar name={patient?.firstName + ' ' + patient?.lastName} size="sm" />
                                                <span>{patient?.firstName} {patient?.lastName}</span>
                                            </div>
                                        );
                                    }},
                                    { key: 'type', title: 'Type' },
                                    { key: 'department', title: 'Department' },
                                    { key: 'doctor', title: 'Doctor', render: (row) => {
                                        const doctor = seedData.users.find(u => u.id === row.doctorId);
                                        return doctor?.name || 'Unassigned';
                                    }},
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'in-progress' ? 'info' : row.status === 'cancelled' ? 'danger' : 'default'}>{row.status}</Badge> }
                                ]}
                                data={filteredAppointments.sort((a, b) => a.time.localeCompare(b.time))}
                                actions={(row) => (
                                    row.status === 'scheduled' && <Button variant="primary" size="sm" onClick={() => handleCheckIn(row)}>Check In</Button>
                                )}
                            />
                        ) : (
                            <div className="overflow-x-auto">
                                <div className="min-w-[800px]">
                                    <div className="grid grid-cols-[100px_repeat(7,1fr)] gap-2">
                                        <div className="text-xs font-medium text-slate-500 uppercase">Time</div>
                                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                            <div key={day} className="text-center text-xs font-medium text-slate-500 uppercase">{day}</div>
                                        ))}
                                        {timeSlots.slice(8, 18).map(time => (
                                            <React.Fragment key={time}>
                                                <div className="text-xs text-slate-400 py-2">{time}</div>
                                                {Array.from({ length: 7 }, (_, i) => {
                                                    const date = new Date(selectedDate + 'T00:00:00');
                                                    date.setDate(date.getDate() - date.getDay() + 1 + i);
                                                    const dayAppointments = appointments.filter(appointment => appointment.date === date.toISOString().slice(0, 10) && appointment.time === time);
                                                    return <div key={i} className="border border-slate-100 rounded p-1 min-h-[40px] hover:bg-slate-50 transition-colors">
                                                        {dayAppointments.map(appointment => {
                                                            const patient = seedData.patients.find(p => p.id === appointment.patientId);
                                                            return <div key={appointment.id} className="bg-medical-100 text-medical-700 text-xs rounded px-1.5 py-0.5 truncate">{patient ? `${patient.firstName} ${patient.lastName}` : 'Appointment'}</div>;
                                                        })}
                                                    </div>;
                                                })}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>

                    <Modal
                        isOpen={showNewAppointment}
                        onClose={() => setShowNewAppointment(false)}
                        title="New Appointment"
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowNewAppointment(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleScheduleAppointment}>Schedule</Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            {saveError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</div>}
                            <Select label="Patient" value={appointmentForm.patientId} onChange={(e) => setAppointmentForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(hydrateSeedData().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Select label="Department" value={appointmentForm.department} onChange={(e) => setAppointmentForm(prev => ({ ...prev, department: e.target.value }))} options={[{ value: '', label: 'Select department...' }, { value: 'cardiology', label: 'Cardiology' }, { value: 'orthopedics', label: 'Orthopedics' }, { value: 'general', label: 'General Medicine' }, { value: 'pediatrics', label: 'Pediatrics' }]} />
                            <Select label="Doctor" value={appointmentForm.doctorId} onChange={(e) => setAppointmentForm(prev => ({ ...prev, doctorId: e.target.value }))} options={[{ value: '', label: 'Select doctor...' }, ...(seedData.users || []).filter(person => person.role === 'doctor').map(person => ({ value: person.id, label: person.name }))]} />
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Date" type="date" value={appointmentForm.date} onChange={(e) => setAppointmentForm(prev => ({ ...prev, date: e.target.value }))} />
                                <Input label="Time" type="time" value={appointmentForm.time} onChange={(e) => setAppointmentForm(prev => ({ ...prev, time: e.target.value }))} />
                            </div>
                            <Select label="Appointment Type" value={appointmentForm.type} onChange={(e) => setAppointmentForm(prev => ({ ...prev, type: e.target.value }))} options={[{ value: '', label: 'Select type...' }, { value: 'consultation', label: 'Consultation' }, { value: 'followup', label: 'Follow-up' }, { value: 'emergency', label: 'Emergency' }, { value: 'routine', label: 'Routine Check' }]} />
                            <TextArea label="Notes" placeholder="Additional notes..." value={appointmentForm.notes} onChange={(e) => setAppointmentForm(prev => ({ ...prev, notes: e.target.value }))} />
                        </div>
                    </Modal>
                </div>
            );
        };

        // ==========================================
        // LABORATORY MODULE
        // ==========================================
        const LaboratoryModule = () => {
            const [activeTab, setActiveTab] = useState('orders');
            const [selectedOrder, setSelectedOrder] = useState(null);
            const [showResultEntry, setShowResultEntry] = useState(false);
            const [showNewOrder, setShowNewOrder] = useState(false);
            const [labOrders, setLabOrders] = useState(hydrateSeedData().labOrders || []);
            const [newOrderForm, setNewOrderForm] = useState({ patientId: '', testType: 'CBC', category: 'Hematology', priority: 'routine' });
            const [resultForm, setResultForm] = useState({ comments: '', values: {} });

            const tabs = [
                { id: 'orders', label: 'Lab Orders' },
                { id: 'results', label: 'Results' },
                { id: 'statistics', label: 'Statistics' },
            ];

            const handleCreateLabOrder = async () => {
                if (!newOrderForm.patientId) return;
                const payload = {
                    id: 'lab_' + Date.now(),
                    patientId: newOrderForm.patientId,
                    doctorId: 'u2',
                    testType: newOrderForm.testType,
                    category: newOrderForm.category,
                    status: 'pending',
                    priority: newOrderForm.priority,
                    orderedDate: new Date().toISOString().split('T')[0],
                    resultDate: null,
                    results: null,
                    technicianId: 'u5'
                };
                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                if (client) {
                    const { data, error } = await client.from('lab_orders').insert([{ ...payload, patient_id: payload.patientId, doctor_id: payload.doctorId, test_type: payload.testType, ordered_date: payload.orderedDate, technician_id: payload.technicianId, category: payload.category, priority: payload.priority, status: payload.status }]).select();
                    if (!error && data && data[0]) {
                        const mapped = { ...payload, id: data[0].id || payload.id, patientId: data[0].patient_id || payload.patientId, doctorId: data[0].doctor_id || payload.doctorId, testType: data[0].test_type || payload.testType, orderedDate: data[0].ordered_date || payload.orderedDate };
                        const next = [...labOrders, mapped];
                        persistSeedTable('labOrders', next);
                        setLabOrders(next);
                        setShowNewOrder(false);
                        return;
                    }
                }
                const next = [...labOrders, payload];
                persistSeedTable('labOrders', next);
                setLabOrders(next);
                setShowNewOrder(false);
            };

            const handleSaveResults = async () => {
                if (!selectedOrder) return;
                const nextOrder = {
                    ...selectedOrder,
                    status: 'completed',
                    resultDate: new Date().toISOString().split('T')[0],
                    results: { values: Object.entries(resultForm.values || {}).map(([parameter, value]) => ({ parameter, value, unit: 'unit', range: 'normal', flag: 'normal' })) }
                };
                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                if (client) {
                    const { error } = await client.from('lab_orders').update({ status: 'completed', result_date: nextOrder.resultDate, results: nextOrder.results }).eq('id', selectedOrder.id);
                    if (!error) {
                        const next = labOrders.map(order => order.id === selectedOrder.id ? nextOrder : order);
                        persistSeedTable('labOrders', next);
                        setLabOrders(next);
                        setShowResultEntry(false);
                        return;
                    }
                }
                const next = labOrders.map(order => order.id === selectedOrder.id ? nextOrder : order);
                persistSeedTable('labOrders', next);
                setLabOrders(next);
                setShowResultEntry(false);
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Laboratory</h2>
                            <p className="text-slate-500 mt-1">Manage lab orders and results</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus} onClick={() => setShowNewOrder(true)}>New Order</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Pending', value: seedData.labOrders.filter(l => l.status === 'pending').length, color: 'amber' },
                            { label: 'Processing', value: seedData.labOrders.filter(l => l.status === 'processing').length, color: 'medical' },
                            { label: 'Completed', value: seedData.labOrders.filter(l => l.status === 'completed').length, color: 'emerald' },
                            { label: 'Critical', value: seedData.labOrders.filter(l => l.status === 'critical').length, color: 'red' },
                        ].map(stat => (
                            <Card key={stat.label} className="text-center">
                                <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                                <p className="text-sm text-slate-500">{stat.label}</p>
                            </Card>
                        ))}
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'orders' && (
                        <Card>
                            <DataTable
                                columns={[
                                    { key: 'id', title: 'Order ID', className: 'font-mono text-xs' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'testType', title: 'Test' },
                                    { key: 'category', title: 'Category' },
                                    { key: 'priority', title: 'Priority', render: (row) => <Badge variant={row.priority === 'stat' ? 'danger' : row.priority === 'urgent' ? 'warning' : 'default'}>{row.priority}</Badge> },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'critical' ? 'danger' : row.status === 'completed' ? 'success' : 'warning'}>{row.status}</Badge> },
                                    { key: 'orderedDate', title: 'Ordered', render: (row) => formatDate(row.orderedDate) }
                                ]}
                                data={labOrders}
                                actions={(row) => (
                                    <>
                                        {row.status !== 'completed' && (
                                            <Button variant="primary" size="sm" onClick={() => { setSelectedOrder(row); setShowResultEntry(true); }}>Enter Results</Button>
                                        )}
                                        <Button variant="ghost" size="sm" icon={Icons.Eye}>View</Button>
                                    </>
                                )}
                            />
                        </Card>
                    )}

                    {activeTab === 'results' && (
                        <Card title="Completed Results">
                            <DataTable
                                columns={[
                                    { key: 'testType', title: 'Test' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'resultDate', title: 'Completed', render: (row) => formatDate(row.resultDate) },
                                    { key: 'results', title: 'Key Findings', render: (row) => {
                                        if (!row.results) return 'N/A';
                                        const abnormal = row.results.values.filter(v => v.flag !== 'normal');
                                        return abnormal.length > 0 ? abnormal.length + ' abnormal values' : 'All normal';
                                    }}
                                ]}
                                data={labOrders.filter(l => l.status === 'completed')}
                            />
                        </Card>
                    )}

                    {activeTab === 'statistics' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Tests by Category">
                                <BarChart 
                                    data={[
                                        { label: 'Hema', value: 45 },
                                        { label: 'Chem', value: 38 },
                                        { label: 'Micro', value: 22 },
                                        { label: 'Sero', value: 15 },
                                        { label: 'Histo', value: 8 }
                                    ]} 
                                    width={500} 
                                    height={250} 
                                    color="#2563eb" 
                                />
                            </Card>
                            <Card title="Turnaround Time Trend">
                                <LineChart 
                                    data={[
                                        { value: 4.2, label: 'W1' },
                                        { value: 3.8, label: 'W2' },
                                        { value: 3.5, label: 'W3' },
                                        { value: 3.2, label: 'W4' }
                                    ]} 
                                    width={500} 
                                    height={250} 
                                    color="#059669" 
                                />
                            </Card>
                        </div>
                    )}

                    <Modal
                        isOpen={showResultEntry}
                        onClose={() => setShowResultEntry(false)}
                        title={'Enter Results - ' + (selectedOrder?.testType || '')}
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowResultEntry(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleSaveResults}>Save Results</Button>
                            </div>
                        }
                    >
                        {selectedOrder && (
                            <div className="space-y-4">
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <p className="text-sm text-slate-600">Patient: {(() => {
                                        const p = seedData.patients.find(p => p.id === selectedOrder.patientId);
                                        return p ? p.firstName + ' ' + p.lastName : '';
                                    })()}</p>
                                    <p className="text-sm text-slate-600">Test: {selectedOrder.testType}</p>
                                </div>
                                <div className="space-y-3">
                                    {['WBC', 'RBC', 'Hemoglobin', 'Hematocrit', 'Platelets', 'MCV'].map(param => (
                                        <div key={param} className="grid grid-cols-3 gap-4 items-center">
                                            <span className="text-sm font-medium text-slate-700">{param}</span>
                                            <Input placeholder="Value" value={resultForm.values[param] || ''} onChange={(e) => setResultForm(prev => ({ ...prev, values: { ...prev.values, [param]: e.target.value } }))} />
                                            <span className="text-xs text-slate-500">Ref: 4.0-11.0</span>
                                        </div>
                                    ))}
                                </div>
                                <TextArea label="Comments" placeholder="Additional comments..." value={resultForm.comments} onChange={(e) => setResultForm(prev => ({ ...prev, comments: e.target.value }))} />
                            </div>
                        )}
                    </Modal>

                    <Modal
                        isOpen={showNewOrder}
                        onClose={() => setShowNewOrder(false)}
                        title="New Lab Order"
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowNewOrder(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleCreateLabOrder}>Create Order</Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <Select label="Patient" value={newOrderForm.patientId} onChange={(e) => setNewOrderForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(hydrateSeedData().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Input label="Test Type" value={newOrderForm.testType} onChange={(e) => setNewOrderForm(prev => ({ ...prev, testType: e.target.value }))} />
                            <Input label="Category" value={newOrderForm.category} onChange={(e) => setNewOrderForm(prev => ({ ...prev, category: e.target.value }))} />
                            <Select label="Priority" value={newOrderForm.priority} onChange={(e) => setNewOrderForm(prev => ({ ...prev, priority: e.target.value }))} options={[{ value: 'routine', label: 'Routine' }, { value: 'urgent', label: 'Urgent' }, { value: 'stat', label: 'Stat' }]} />
                        </div>
                    </Modal>
                </div>
            );
        };

        // ==========================================
        // RADIOLOGY MODULE
        // ==========================================
        const RadiologyModule = () => {
            const [selectedStudy, setSelectedStudy] = useState(null);
            const [showNewOrder, setShowNewOrder] = useState(false);
            const [studies, setStudies] = useState(hydrateSeedData().radiologyOrders || []);
            const [orderForm, setOrderForm] = useState({ patientId: '', studyType: 'Chest X-Ray', modality: 'X-Ray', priority: 'routine', scheduledDate: '2026-09-01', report: '' });

            const handleCreateStudy = async () => {
                if (!orderForm.patientId || !orderForm.studyType) return;
                const payload = {
                    id: 'rad_' + Date.now(),
                    patientId: orderForm.patientId,
                    doctorId: 'u2',
                    studyType: orderForm.studyType,
                    modality: orderForm.modality,
                    priority: orderForm.priority,
                    status: 'requested',
                    scheduledDate: orderForm.scheduledDate,
                    report: orderForm.report || '',
                    orderedDate: new Date().toISOString().split('T')[0]
                };

                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                if (client) {
                    const { data, error } = await client.from('radiology_orders').insert([{ ...payload, patient_id: payload.patientId, doctor_id: payload.doctorId, study_type: payload.studyType, modality: payload.modality, priority: payload.priority, status: payload.status, scheduled_date: payload.scheduledDate, report: payload.report, ordered_date: payload.orderedDate }]).select();
                    if (!error && data && data[0]) {
                        const mapped = { ...payload, id: data[0].id || payload.id, patientId: data[0].patient_id || payload.patientId, doctorId: data[0].doctor_id || payload.doctorId, studyType: data[0].study_type || payload.studyType, scheduledDate: data[0].scheduled_date || payload.scheduledDate, report: data[0].report || payload.report };
                        const next = [...studies, mapped];
                        persistSeedTable('radiologyOrders', next);
                        setStudies(next);
                        setShowNewOrder(false);
                        setOrderForm({ patientId: '', studyType: 'Chest X-Ray', modality: 'X-Ray', priority: 'routine', scheduledDate: '2026-09-01', report: '' });
                        return;
                    }
                }

                const next = [...studies, payload];
                persistSeedTable('radiologyOrders', next);
                setStudies(next);
                setShowNewOrder(false);
                setOrderForm({ patientId: '', studyType: 'Chest X-Ray', modality: 'X-Ray', priority: 'routine', scheduledDate: '2026-09-01', report: '' });
            };

            const handleReportStudy = async (row) => {
                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                const updated = { ...row, status: 'reported', report: row.report || 'Report finalized by radiology team.' };

                if (client) {
                    const { error } = await client.from('radiology_orders').update({ status: 'reported', report: updated.report }).eq('id', row.id);
                    if (!error) {
                        const next = studies.map((item) => item.id === row.id ? updated : item);
                        persistSeedTable('radiologyOrders', next);
                        setStudies(next);
                        return;
                    }
                }

                const next = studies.map((item) => item.id === row.id ? updated : item);
                persistSeedTable('radiologyOrders', next);
                setStudies(next);
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Radiology</h2>
                            <p className="text-slate-500 mt-1">Imaging orders and reports</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus} onClick={() => setShowNewOrder(true)}>New Imaging Order</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {[
                            { label: 'X-Ray', value: studies.filter(r => r.modality === 'X-Ray').length, icon: Icons.Image },
                            { label: 'MRI', value: studies.filter(r => r.modality === 'MRI').length, icon: Icons.Image },
                            { label: 'CT', value: studies.filter(r => r.modality === 'CT').length, icon: Icons.Image },
                            { label: 'Ultrasound', value: studies.filter(r => r.modality === 'Ultrasound').length, icon: Icons.Image },
                            { label: 'ECG', value: studies.filter(r => r.modality === 'ECG').length, icon: Icons.Activity },
                        ].map(mod => (
                            <Card key={mod.label} className="text-center hover-lift cursor-pointer">
                                <mod.icon size={24} className="mx-auto text-medical-600 mb-2" />
                                <p className="text-2xl font-bold text-slate-900">{mod.value}</p>
                                <p className="text-sm text-slate-500">{mod.label}</p>
                            </Card>
                        ))}
                    </div>

                    <Card>
                        <DataTable
                            columns={[
                                { key: 'id', title: 'Order ID', className: 'font-mono text-xs' },
                                { key: 'patient', title: 'Patient', render: (row) => {
                                    const patient = seedData.patients.find(p => p.id === row.patientId);
                                    return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                }},
                                { key: 'studyType', title: 'Study' },
                                { key: 'modality', title: 'Modality' },
                                { key: 'priority', title: 'Priority', render: (row) => <Badge variant={row.priority === 'stat' ? 'danger' : row.priority === 'urgent' ? 'warning' : 'default'}>{row.priority}</Badge> },
                                { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'reported' ? 'success' : row.status === 'completed' ? 'info' : 'warning'}>{row.status}</Badge> },
                                { key: 'scheduledDate', title: 'Scheduled', render: (row) => formatDate(row.scheduledDate) }
                            ]}
                            data={studies}
                            actions={(row) => (
                                <>
                                    <Button variant="primary" size="sm" onClick={() => setSelectedStudy(row)}>View Images</Button>
                                    {row.status !== 'reported' && <Button variant="secondary" size="sm" onClick={() => handleReportStudy(row)}>Report</Button>}
                                </>
                            )}
                        />
                    </Card>

                    <Modal
                        isOpen={showNewOrder}
                        onClose={() => setShowNewOrder(false)}
                        title="New Imaging Order"
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowNewOrder(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleCreateStudy}>Create Order</Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <Select label="Patient" value={orderForm.patientId} onChange={(e) => setOrderForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(hydrateSeedData().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Input label="Study Type" value={orderForm.studyType} onChange={(e) => setOrderForm(prev => ({ ...prev, studyType: e.target.value }))} />
                            <Select label="Modality" value={orderForm.modality} onChange={(e) => setOrderForm(prev => ({ ...prev, modality: e.target.value }))} options={[{ value: 'X-Ray', label: 'X-Ray' }, { value: 'MRI', label: 'MRI' }, { value: 'CT', label: 'CT' }, { value: 'Ultrasound', label: 'Ultrasound' }, { value: 'ECG', label: 'ECG' }]} />
                            <Select label="Priority" value={orderForm.priority} onChange={(e) => setOrderForm(prev => ({ ...prev, priority: e.target.value }))} options={[{ value: 'routine', label: 'Routine' }, { value: 'urgent', label: 'Urgent' }, { value: 'stat', label: 'Stat' }]} />
                            <Input label="Scheduled Date" type="date" value={orderForm.scheduledDate} onChange={(e) => setOrderForm(prev => ({ ...prev, scheduledDate: e.target.value }))} />
                            <TextArea label="Radiologist Notes" value={orderForm.report} onChange={(e) => setOrderForm(prev => ({ ...prev, report: e.target.value }))} rows={3} />
                        </div>
                    </Modal>

                    <Modal
                        isOpen={!!selectedStudy}
                        onClose={() => setSelectedStudy(null)}
                        title={selectedStudy?.studyType || ''}
                        size="lg"
                    >
                        {selectedStudy && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="aspect-square bg-slate-900 rounded-xl flex items-center justify-center">
                                        <div className="text-center text-slate-400">
                                            <Icons.Image size={48} className="mx-auto mb-2" />
                                            <p className="text-sm">DICOM Image Viewer</p>
                                            <p className="text-xs">Click to interact</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="p-4 bg-slate-50 rounded-lg">
                                            <h4 className="font-medium text-slate-900 mb-2">Study Information</h4>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between"><span className="text-slate-500">Modality:</span><span className="font-medium">{selectedStudy.modality}</span></div>
                                                <div className="flex justify-between"><span className="text-slate-500">Scheduled:</span><span className="font-medium">{formatDate(selectedStudy.scheduledDate)}</span></div>
                                                <div className="flex justify-between"><span className="text-slate-500">Images:</span><span className="font-medium">{(selectedStudy.images || []).length}</span></div>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-lg">
                                            <h4 className="font-medium text-slate-900 mb-2">Radiologist Report</h4>
                                            <p className="text-sm text-slate-600">{selectedStudy.report || 'No report available yet.'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Modal>
                </div>
            );
        };
