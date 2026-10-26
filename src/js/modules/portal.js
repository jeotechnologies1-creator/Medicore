        // PATIENT PORTAL MODULE
        // ==========================================
        const PatientPortalModule = ({ initialTab = 'overview' }) => {
            const { user } = useAuth();
            const patientLookupId = user?.patientId || user?.id || null;
            const patient = appData.patients.find(p => p.id === patientLookupId || p.patientNumber === patientLookupId);
            const [activeTab, setActiveTab] = useState(initialTab);
            const [messageDraft, setMessageDraft] = useState('');
            const [appointmentDraft, setAppointmentDraft] = useState({
                department: '',
                date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                time: '',
                reason: '',
                visitType: ''
            });
            const [refillDraft, setRefillDraft] = useState({ medication: '', quantity: '30', notes: '' });
            const [portalMessages, setPortalMessages] = useState([]);
            const [bankAccounts, setBankAccounts] = useState([]);
            const [appointmentRequests, setAppointmentRequests] = useState([]);
            const [appointmentMessage, setAppointmentMessage] = useState('');
            const [paymentGateways, setPaymentGateways] = useState([]);
            const [providerPayments, setProviderPayments] = useState([]);
            const [checkoutMessage, setCheckoutMessage] = useState('');
            const [checkoutUrl, setCheckoutUrl] = useState('');
            const [messageError, setMessageError] = useState('');

            useEffect(() => {
                let active = true;
                const client = window.OneMedSupabase?.getClient?.();
                if (client && patient?.id) {
                    client.from('appointments').select('*').eq('patient_id', patient.id).order('appointment_date', { ascending: true }).then(({ data, error }) => {
                        if (active && !error) setAppointmentRequests(normalizeAppointments(data || []));
                    });
                }
                client?.rpc('get_portal_payment_accounts').then(({ data, error }) => {
                    if (active && !error) setBankAccounts(Array.isArray(data) ? data : []);
                }).catch(() => {});
                client?.from('integration_connections').select('id,facility_id,provider_code').eq('integration_type', 'payment_gateway').eq('status', 'active').then(({ data }) => {
                    if (active) setPaymentGateways(data || []);
                });
                client?.from('payment_provider_transactions').select('id,billing_id,amount,currency,status,checkout_url,created_at').order('created_at', { ascending: false }).then(({ data }) => {
                    if (active) setProviderPayments(data || []);
                });
                return () => { active = false; };
            }, [patient?.id]);

            const paymentAccountFor = (invoice) => {
                const scope = [invoice.department, invoice.service].filter(Boolean).map((item) => item.trim().toLowerCase());
                const scopesFor = (account) => [account.department, ...(account.departments || [])].filter(Boolean).map((item) => item.trim().toLowerCase());
                const scopedAccounts = bankAccounts.filter((account) => scopesFor(account).length);
                return scopedAccounts.find((account) => scopesFor(account).some((item) => scope.includes(item)))
                    || bankAccounts.find((account) => !scopesFor(account).length)
                    || (!scopedAccounts.length ? bankAccounts.find((account) => account.primary) : null)
                    || null;
            };

            const tabs = [
                { id: 'overview', label: 'Overview' },
                { id: 'appointments', label: 'Appointments' },
                { id: 'lab_results', label: 'Lab Results' },
                { id: 'prescriptions', label: 'Prescriptions' },
                { id: 'billing', label: 'Billing' },
                { id: 'messages', label: 'Messages' },
            ];

            useEffect(() => {
                setActiveTab(initialTab);
            }, [initialTab]);

            useEffect(() => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client || !patient?.id) return;
                client.from('patient_messages').select('*').eq('patient_id', patient.id).order('sent_at').then(({ data, error }) => {
                    if (!error) setPortalMessages((data || []).map((row) => ({ id: row.id, sender: row.sender_name, direction: row.direction, text: row.message, sentAt: row.sent_at })));
                });
            }, [patient?.id]);

            const handleSendMessage = async () => {
                if (!messageDraft.trim()) return;
                if (/\b(appointment|book|doctor|schedule)\b/i.test(messageDraft)) {
                    setAppointmentDraft((current) => ({ ...current, reason: messageDraft.trim() }));
                    setAppointmentMessage('I can help you request an appointment. Choose a department and preferred date below; the request will go to HIM to confirm with the doctor.');
                    setMessageDraft(''); setActiveTab('appointments');
                    return;
                }
                const client = window.OneMedSupabase?.getClient?.();
                if (!client || !patient?.id) return;
                setMessageError('');
                const { data, error } = await client.from('patient_messages').insert({ patient_id: patient.id, sender_profile_id: user.id, sender_name: 'You', direction: 'outgoing', message: messageDraft.trim() }).select();
                if (error || !data?.[0]) { setMessageError(error?.message || 'Your message could not be sent.'); return; }
                setPortalMessages((current) => [...current, { id: data[0].id, sender: data[0].sender_name, direction: data[0].direction, text: data[0].message, sentAt: data[0].sent_at }]);
                setMessageDraft('');
            };

            const refreshPayments = async () => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return;
                const [{ data: gateways }, { data: transactions }] = await Promise.all([
                    client.from('integration_connections').select('id,facility_id,provider_code').eq('integration_type', 'payment_gateway').eq('status', 'active'),
                    client.from('payment_provider_transactions').select('id,billing_id,amount,currency,status,checkout_url,created_at').order('created_at', { ascending: false })
                ]);
                setPaymentGateways(gateways || []); setProviderPayments(transactions || []);
            };

            const startCheckout = async (invoice) => {
                const client = window.OneMedSupabase?.getClient?.();
                const gateway = paymentGateways[0];
                if (!client || !gateway) { setCheckoutMessage('Online payment is not configured for this facility. Please use the listed bank transfer instructions.'); return; }
                setCheckoutUrl('');
                setCheckoutMessage('Creating secure checkout…');
                const key = globalThis.crypto?.randomUUID?.() || `portal-${invoice.id}-${Date.now()}`;
                const { data: transactionId, error } = await client.rpc('request_patient_payment_checkout', {
                    p_billing_id: invoice.id, p_connection_id: gateway.id, p_amount: Number(invoice.balance), p_idempotency_key: key, p_currency: 'NGN'
                });
                if (error || !transactionId) { setCheckoutMessage(error?.message || 'Checkout could not be started.'); return; }
                await refreshPayments();
                const { data: transaction } = await client.from('payment_provider_transactions').select('checkout_url,status').eq('id', transactionId).maybeSingle();
                setCheckoutUrl(transaction?.checkout_url?.startsWith('https://') ? transaction.checkout_url : '');
                setCheckoutMessage(transaction?.checkout_url ? 'Provider checkout is ready. Payment will show as confirmed after provider notification and Accounts review.' : 'Checkout request queued. Refresh this page shortly for the provider checkout link.');
            };

            const handleBookAppointment = async () => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client || !patient?.id || !appointmentDraft.date || !appointmentDraft.department) {
                    setAppointmentMessage('Choose a department and preferred date to send your appointment request.');
                    return;
                }
                const { data, error } = await client.from('appointments').insert({ patient_id: patient.id, doctor_id: null, appointment_date: appointmentDraft.date, appointment_time: appointmentDraft.time || null, appointment_type: appointmentDraft.visitType || 'portal_request', department: appointmentDraft.department, status: 'requested', notes: appointmentDraft.reason || null }).select().single();
                if (error || !data) {
                    setAppointmentMessage(error?.message || 'Your appointment request could not be sent.');
                    return;
                }
                setAppointmentRequests((current) => [...current, ...normalizeAppointments([data])]);
                const { data: routedMessage, error: routingError } = await client.from('patient_messages').insert({ patient_id: patient.id, sender_profile_id: user.id, sender_name: 'You', direction: 'outgoing', message: `Appointment request ${data.id}: ${appointmentDraft.department}, preferred ${appointmentDraft.date}${appointmentDraft.time ? ` at ${appointmentDraft.time}` : ''}. Visit: ${appointmentDraft.visitType || 'appointment'}.${appointmentDraft.reason ? ` Reason: ${appointmentDraft.reason}` : ''}` }).select().single();
                if (routedMessage) setPortalMessages((current) => [...current, { id: routedMessage.id, sender: routedMessage.sender_name, direction: routedMessage.direction, text: routedMessage.message, sentAt: routedMessage.sent_at }]);
                setAppointmentMessage('Request sent. The Health Information Management (HIM) team will confirm the date and time after checking with the doctor.');
                if (routingError) setAppointmentMessage('Request sent and visible in the appointment queue. The chat notification could not be added; HIM can still manage the appointment request.');
                setAppointmentDraft({
                    department: '',
                    date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    time: '',
                    reason: '',
                    visitType: ''
                });
                setActiveTab('appointments');
            };

            const handleRequestRefill = async () => {
                if (!refillDraft.medication.trim()) return;
                const client = window.OneMedSupabase?.getClient?.();
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
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate((appData.appointments || []).filter(a => a.patientId === patient.id).slice(-1)[0]?.date)}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Active meds</p>
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{(appData.medicationOrders || []).filter(m => m.patientId === patient.id && m.status === 'active').length}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Open bills</p>
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{(appData.billing || []).filter(b => b.patientId === patient.id && Number(b.balance || 0) > 0).length}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Next review</p>
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate((appData.appointments || []).filter(a => a.patientId === patient.id && a.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date))[0]?.date)}</p>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {activeTab === 'appointments' && (
                            <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-6">
                                <Card>
                                    <div className="mb-3 flex justify-end">
                                        <Button variant="ghost" size="sm" onClick={async () => {
                                            const client = window.OneMedSupabase?.getClient?.();
                                            if (!client || !patient?.id) return;
                                            const { data, error } = await client.from('appointments').select('*').eq('patient_id', patient.id).order('appointment_date', { ascending: true });
                                            if (!error) setAppointmentRequests(normalizeAppointments(data || []));
                                        }}>Refresh appointment status</Button>
                                    </div>
                                    <DataTable
                                        columns={[
                                            { key: 'date', title: 'Requested / confirmed date', render: (row) => formatDate(row.date) },
                                            { key: 'time', title: 'Time' },
                                            { key: 'type', title: 'Type' },
                                            { key: 'department', title: 'Department' },
                                            { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' || row.status === 'scheduled' ? 'success' : row.status === 'declined' ? 'danger' : 'warning'}>{row.status === 'scheduled' ? 'confirmed' : row.status}</Badge> }
                                        ]}
                                        data={appointmentRequests}
                                    />
                                </Card>
                                <Card title="Request appointment">
                                    <div className="space-y-3">
                                        <Select label="Department" value={appointmentDraft.department} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, department: e.target.value }))} options={[{ value: '', label: 'Select department' }, { value: 'medical', label: 'Medical' }, { value: 'surgical', label: 'Surgical' }, { value: 'diagnostic', label: 'Diagnostic' }, { value: 'specialist', label: 'Specialist' }]} />
                                        <Input label="Preferred date" type="date" value={appointmentDraft.date} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, date: e.target.value }))} />
                                        <Input label="Preferred time" type="time" value={appointmentDraft.time} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, time: e.target.value }))} />
                                        <Select label="Visit type" value={appointmentDraft.visitType} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, visitType: e.target.value }))} options={[{ value: '', label: 'Select visit type' }, { value: 'follow_up', label: 'Follow-up' }, { value: 'consultation', label: 'Consultation' }, { value: 'review', label: 'Review' }, { value: 'procedure', label: 'Procedure' }]} />
                                        <Input label="Reason" value={appointmentDraft.reason} onChange={(e) => setAppointmentDraft(prev => ({ ...prev, reason: e.target.value }))} />
                                        {appointmentMessage && <p className={'text-sm ' + (appointmentMessage.startsWith('Request sent') ? 'text-emerald-700' : 'text-red-600')}>{appointmentMessage}</p>}
                                        <p className="text-xs text-slate-500">Your preferred date is a request. The Health Information Management (HIM) team will check the doctor’s availability and confirm the date and time here.</p>
                                        <Button variant="primary" icon={Icons.Calendar} onClick={handleBookAppointment}>Send appointment request</Button>
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
                                    data={appData.labOrders.filter(l => l.patientId === patient.id)}
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
                                    data={appData.prescriptions.filter(p => p.patientId === patient.id)}
                                />
                            </Card>
                        )}

                        {activeTab === 'billing' && (
                            <Card>
                                <DataTable
                                    columns={[
                                        { key: 'invoiceNumber', title: 'Invoice' },
                                        { key: 'department', title: 'Department / Service', render: (row) => [row.department, row.service].filter(Boolean).join(' · ') || 'General' },
                                        { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                        { key: 'total', title: 'Total', render: (row) => formatCurrency(row.total) },
                                        { key: 'balance', title: 'Balance', render: (row) => formatCurrency(row.balance) },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'paid' ? 'success' : 'warning'}>{row.status}</Badge> },
                                            { key: 'action', title: 'Pay this invoice', render: (row) => {
                                            if (Number(row.balance || 0) <= 0) return <span className="text-emerald-700 text-xs">No balance due</span>;
                                            const transaction = providerPayments.find((item) => item.billing_id === row.id && ['creating','pending','review_pending','posted'].includes(item.status));
                                            if (transaction?.status === 'posted') return <span className="text-emerald-700 text-xs">Payment recorded</span>;
                                            if (transaction?.status === 'review_pending') return <span className="text-amber-700 text-xs">Payment received · Accounts review pending</span>;
                                            if (transaction?.checkout_url?.startsWith('https://')) return <a className="text-medical-700 underline text-sm" href={transaction.checkout_url} target="_blank" rel="noopener noreferrer">Continue checkout</a>;
                                            if (paymentGateways.length) return <Button size="sm" variant="primary" onClick={() => startCheckout(row)}>{transaction ? 'Checkout preparing…' : 'Pay online'}</Button>;
                                            const account = paymentAccountFor(row);
                                            return account ? <div className="text-xs text-slate-600"><span className="font-medium">{account.bankName}</span><br />{account.accountName}<br />{account.accountNumber}<br /><span>Use {row.invoiceNumber} as reference</span></div> : <span className="text-amber-700 text-xs">No account configured for this service</span>;
                                        } }
                                    ]}
                                    data={appData.billing.filter(b => b.patientId === patient.id)}
                                />
                                {checkoutMessage && <p role="status" className="mt-3 text-sm text-slate-700">{checkoutMessage}{checkoutUrl && <> <a className="font-medium text-medical-700 underline" href={checkoutUrl} target="_blank" rel="noopener noreferrer">Continue to secure checkout</a></>}</p>}
                                <div className="mt-3 flex items-center justify-between"><p className="text-xs text-slate-500">Provider payments remain pending until the provider webhook is received and Accounts reviews the payment.</p><Button size="sm" variant="ghost" onClick={refreshPayments}>Refresh payment status</Button></div>
                            </Card>
                        )}

                        {activeTab === 'messages' && (
                            <Card title="Patient chat" subtitle="The portal assistant can guide appointment requests. Messages are routed to the Health Information Management (HIM) team for follow up.">
                                <div className="space-y-4">
                                    <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={async () => { const client = window.OneMedSupabase?.getClient?.(); if (!client) return; const { data, error } = await client.from('patient_messages').select('*').eq('patient_id', patient.id).order('sent_at'); if (!error) setPortalMessages((data || []).map((row) => ({ id: row.id, sender: row.sender_name, direction: row.direction, text: row.message, sentAt: row.sent_at }))); }}>Refresh messages</Button></div>
                                    <div className="rounded-lg border border-medical-100 bg-medical-50 p-3 text-sm text-medical-900">
                                        <p className="font-medium">OneMed assistant</p>
                                        <p className="mt-1">Hi {patient.firstName}. I can help you request an appointment or send a message to the HIM team. Appointment requests are reviewed by HIM; your appointment is confirmed only after they check with the doctor.</p>
                                        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setActiveTab('appointments')}>Request an appointment</Button><Button size="sm" variant="secondary" onClick={() => setMessageDraft('Please help me with: ')}>Ask the HIM team</Button></div>
                                    </div>
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
                                    {messageError && <p role="alert" className="text-sm text-red-700">{messageError}</p>}
                                    <div className="flex gap-3">
                                        <textarea
                                            value={messageDraft}
                                            onChange={(e) => setMessageDraft(e.target.value)}
                                            placeholder="Message the HIM team..."
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
