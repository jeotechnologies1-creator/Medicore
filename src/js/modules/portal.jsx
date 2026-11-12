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
                date: formatFacilityDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)),
                time: '',
                reason: '',
                visitType: ''
            });
            const [refillDraft, setRefillDraft] = useState({ prescriptionItemId: '', quantity: '30', notes: '' });
            const [refillItems, setRefillItems] = useState([]);
            const [refillMessage, setRefillMessage] = useState('');
            const [submittingRefill, setSubmittingRefill] = useState(false);
            const [portalMessages, setPortalMessages] = useState([]);
            const [sendingMessage, setSendingMessage] = useState(false);
            const [bankAccounts, setBankAccounts] = useState([]);
            const [appointmentRequests, setAppointmentRequests] = useState([]);
            const [appointmentMessage, setAppointmentMessage] = useState('');
            const [submittingAppointment, setSubmittingAppointment] = useState(false);
            const [paymentGateways, setPaymentGateways] = useState([]);
            const [providerPayments, setProviderPayments] = useState([]);
            const [portalDataError, setPortalDataError] = useState('');
            const [checkoutMessage, setCheckoutMessage] = useState('');
            const [checkoutUrl, setCheckoutUrl] = useState('');
            const [messageError, setMessageError] = useState('');
            const [privacyRequestType, setPrivacyRequestType] = useState('access');
            const [privacyRequestDescription, setPrivacyRequestDescription] = useState('');
            const [privacyRequests, setPrivacyRequests] = useState([]);
            const [privacyRequestMessage, setPrivacyRequestMessage] = useState('');
            const [privacyRequestBusy, setPrivacyRequestBusy] = useState(false);

            useEffect(() => {
                if (!patient?.id) { setRefillItems([]); return; }
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return;
                client.from('prescriptions').select('id').eq('patient_id', patient.id).in('status', ['active', 'dispensed'])
                    .then(async ({ data: prescriptions, error }) => {
                        if (error || !prescriptions?.length) { setRefillItems([]); return; }
                        const { data, error: itemError } = await client.from('prescription_items')
                            .select('id,formulary_item_id,dose,dose_unit,route,formulary_items(generic_name,strength,form)')
                            .in('prescription_id', prescriptions.map((row) => row.id));
                        setRefillItems(itemError ? [] : data || []);
                    });
            }, [patient?.id]);
            const [selectedLabResult, setSelectedLabResult] = useState(null);

            useEffect(() => {
                let active = true;
                const client = window.OneMedSupabase?.getClient?.();
                setPortalDataError('');
                if (!client) {
                    setPortalDataError('The patient portal could not connect to the hospital service. Try again later.');
                    return () => { active = false; };
                }
                if (client && patient?.id) {
                    client.from('appointments').select('*').eq('patient_id', patient.id).order('appointment_date', { ascending: true }).then(({ data, error }) => {
                        if (!active) return;
                        if (error) setAppointmentMessage('Appointment status could not be loaded. Please refresh or contact your care team.');
                        else setAppointmentRequests(normalizeAppointments(data || []));
                    }).catch(() => {
                        if (active) setAppointmentMessage('Appointment status could not be loaded. Please refresh or contact your care team.');
                    });
                }
                client?.rpc('get_portal_payment_accounts').then(({ data, error }) => {
                    if (!active) return;
                    if (error) setPortalDataError('Payment instructions could not be loaded. Contact Accounts for assistance.');
                    else setBankAccounts(Array.isArray(data) ? data : []);
                }).catch(() => {
                    if (active) setPortalDataError('Payment instructions could not be loaded. Contact Accounts for assistance.');
                });
                client.from('integration_connections').select('id,facility_id,provider_code').eq('integration_type', 'payment_gateway').eq('status', 'active').then(({ data, error }) => {
                    if (!active) return;
                    if (error) setPortalDataError('Online payment availability could not be checked.');
                    else setPaymentGateways(data || []);
                }).catch(() => {
                    if (active) setPortalDataError('Online payment availability could not be checked.');
                });
                client.from('payment_provider_transactions').select('id,billing_id,amount,currency,status,checkout_url,created_at').order('created_at', { ascending: false }).then(({ data, error }) => {
                    if (!active) return;
                    if (error) setPortalDataError('Payment status could not be loaded. Use Refresh payment status or contact Accounts.');
                    else setProviderPayments(data || []);
                }).catch(() => {
                    if (active) setPortalDataError('Payment status could not be loaded. Use Refresh payment status or contact Accounts.');
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
                { id: 'privacy', label: 'Privacy requests' },
            ];

            useEffect(() => {
                setActiveTab(initialTab);
            }, [initialTab]);

            useEffect(() => {
                if (activeTab !== 'privacy') return;
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) { setPrivacyRequestMessage('The privacy request service is unavailable.'); return; }
                client.rpc('list_my_data_subject_requests').then(({ data, error }) => {
                    if (error) setPrivacyRequestMessage('Your privacy requests could not be loaded.');
                    else setPrivacyRequests(data || []);
                });
            }, [activeTab]);

            const submitPrivacyRequest = async () => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client || !privacyRequestDescription.trim()) { setPrivacyRequestMessage('Describe what you are asking the facility to do.'); return; }
                setPrivacyRequestBusy(true); setPrivacyRequestMessage('');
                try {
                    const { error } = await client.rpc('create_data_subject_request', { p_patient_id: patient?.id || null, p_request_type: privacyRequestType, p_description: privacyRequestDescription.trim() });
                    if (error) throw error;
                    const { data, error: listError } = await client.rpc('list_my_data_subject_requests');
                    if (listError) throw listError;
                    setPrivacyRequests(data || []); setPrivacyRequestDescription(''); setPrivacyRequestMessage('Request received. The displayed due date uses the facility’s configurable provisional schedule.');
                } catch (error) { setPrivacyRequestMessage(`Request could not be submitted. ${error?.message || ''}`.trim()); }
                finally { setPrivacyRequestBusy(false); }
            };

            useEffect(() => {
                let active = true;
                const client = window.OneMedSupabase?.getClient?.();
                if (!client || !patient?.id) return () => { active = false; };
                client.from('patient_messages').select('*').eq('patient_id', patient.id).order('sent_at').then(({ data, error }) => {
                    if (!active) return;
                    if (error) setMessageError('Messages could not be loaded. Please refresh or try again later.');
                    else setPortalMessages((data || []).map((row) => ({ id: row.id, sender: row.sender_name, direction: row.direction, text: row.message, sentAt: row.sent_at })));
                }).catch(() => {
                    if (active) setMessageError('Messages could not be loaded. Please refresh or try again later.');
                });
                return () => { active = false; };
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
                if (!client || !patient?.id) { setMessageError('The messaging service is unavailable. Please try again later.'); return; }
                if (sendingMessage) return;
                setMessageError('');
                setSendingMessage(true);
                try {
                    const { data, error } = await client.from('patient_messages').insert({ patient_id: patient.id, sender_profile_id: user?.id, sender_name: 'You', direction: 'outgoing', message: messageDraft.trim() }).select();
                    if (error || !data?.[0]) throw error || new Error('No message returned.');
                    setPortalMessages((current) => [...current, { id: data[0].id, sender: data[0].sender_name, direction: data[0].direction, text: data[0].message, sentAt: data[0].sent_at }]);
                    setMessageDraft('');
                } catch (error) {
                    console.error('Portal message submission failed:', error);
                    setMessageError('Your message could not be sent. Please try again.');
                } finally {
                    setSendingMessage(false);
                }
            };

            const refreshPayments = async () => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) { setCheckoutMessage('Payment status is unavailable because the service is not connected.'); return; }
                try {
                    const [gatewayResult, transactionResult] = await Promise.all([
                        client.from('integration_connections').select('id,facility_id,provider_code').eq('integration_type', 'payment_gateway').eq('status', 'active'),
                        client.from('payment_provider_transactions').select('id,billing_id,amount,currency,status,checkout_url,created_at').order('created_at', { ascending: false })
                    ]);
                    if (gatewayResult.error || transactionResult.error) throw gatewayResult.error || transactionResult.error;
                    setPaymentGateways(gatewayResult.data || []); setProviderPayments(transactionResult.data || []);
                    setCheckoutMessage('Payment status refreshed.');
                } catch (error) {
                    console.error('Portal payment refresh failed:', error);
                    setCheckoutMessage('Payment status could not be refreshed. Please try again later.');
                }
            };

            const startCheckout = async (invoice) => {
                const client = window.OneMedSupabase?.getClient?.();
                const gateway = paymentGateways[0];
                if (!client || !gateway) { setCheckoutMessage('Online payment is not configured for this facility. Please use the listed bank transfer instructions.'); return; }
                setCheckoutUrl('');
                setCheckoutMessage('Creating secure checkout…');
                const key = globalThis.crypto?.randomUUID?.() || `portal-${invoice.id}-${Date.now()}`;
                try {
                    const { data: transactionId, error } = await client.rpc('request_patient_payment_checkout', {
                        p_billing_id: invoice.id, p_connection_id: gateway.id, p_amount: Number(invoice.balance), p_idempotency_key: key, p_currency: 'NGN'
                    });
                    if (error || !transactionId) throw error || new Error('Checkout request returned no transaction.');
                    await refreshPayments();
                    const { data: transaction, error: transactionError } = await client.from('payment_provider_transactions').select('checkout_url,status').eq('id', transactionId).maybeSingle();
                    if (transactionError) throw transactionError;
                    setCheckoutUrl(transaction?.checkout_url?.startsWith('https://') ? transaction.checkout_url : '');
                    setCheckoutMessage(transaction?.checkout_url ? 'Provider checkout is ready. Payment will show as confirmed after provider notification and Accounts review.' : 'Checkout request queued. Refresh this page shortly for the provider checkout link.');
                } catch (error) {
                    console.error('Portal checkout request failed:', error);
                    setCheckoutMessage('Secure checkout could not be started. Please try again or use the listed bank transfer instructions.');
                }
            };

            const handleBookAppointment = async () => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client || !patient?.id || !appointmentDraft.date || !appointmentDraft.department) {
                    setAppointmentMessage('Choose a department and preferred date to send your appointment request.');
                    return;
                }
                if (submittingAppointment) return;
                setSubmittingAppointment(true);
                setAppointmentMessage('');
                try {
                    const { data, error } = await client.from('appointments').insert({ patient_id: patient.id, doctor_id: null, appointment_date: appointmentDraft.date, appointment_time: appointmentDraft.time || null, appointment_type: appointmentDraft.visitType || 'portal_request', department: appointmentDraft.department, status: 'requested', notes: appointmentDraft.reason || null }).select().single();
                    if (error || !data) throw error || new Error('No appointment request returned.');
                    setAppointmentRequests((current) => [...current, ...normalizeAppointments([data])]);
                    setAppointmentMessage('Request sent. The Health Information Management (HIM) team will confirm the date and time after checking with the doctor.');
                    setAppointmentDraft({
                        department: '',
                        date: formatFacilityDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)),
                        time: '',
                        reason: '',
                        visitType: ''
                    });
                    setActiveTab('appointments');
                    try {
                        const { data: routedMessage, error: routingError } = await client.from('patient_messages').insert({ patient_id: patient.id, sender_profile_id: user?.id, sender_name: 'You', direction: 'outgoing', message: `Appointment request ${data.id}: ${appointmentDraft.department}, preferred ${appointmentDraft.date}${appointmentDraft.time ? ` at ${appointmentDraft.time}` : ''}. Visit: ${appointmentDraft.visitType || 'appointment'}.${appointmentDraft.reason ? ` Reason: ${appointmentDraft.reason}` : ''}` }).select().single();
                        if (routingError) throw routingError;
                        if (routedMessage) setPortalMessages((current) => [...current, { id: routedMessage.id, sender: routedMessage.sender_name, direction: routedMessage.direction, text: routedMessage.message, sentAt: routedMessage.sent_at }]);
                    } catch (routingError) {
                        console.error('Appointment chat notification failed:', routingError);
                        setAppointmentMessage('Request sent and visible in the appointment queue. Its chat notification could not be added; HIM can still manage it.');
                    }
                } catch (error) {
                    console.error('Portal appointment request failed:', error);
                    setAppointmentMessage('Your appointment request could not be sent. Please check the details and try again.');
                } finally {
                    setSubmittingAppointment(false);
                }
            };

            const handleRequestRefill = async () => {
                if (submittingRefill) return;
                const prescribedItem = refillItems.find((item) => item.id === refillDraft.prescriptionItemId);
                const quantity = Number(refillDraft.quantity);
                if (!prescribedItem || !Number.isFinite(quantity) || quantity <= 0) {
                    setRefillMessage('Select one of your prescribed medications and enter a quantity greater than zero.');
                    return;
                }
                const client = window.OneMedSupabase?.getClient?.();
                if (!client || !patient?.id) {
                    setRefillMessage('The refill request service is unavailable. Please try again later.');
                    return;
                }
                setSubmittingRefill(true);
                setRefillMessage('');
                try {
                    const { error } = await client.from('medication_refill_requests').insert({
                        patient_id: patient.id,
                        prescription_item_id: prescribedItem.id,
                        formulary_item_id: prescribedItem.formulary_item_id,
                        medication_name: prescribedItem.formulary_items?.generic_name || 'Prescribed medication',
                        quantity,
                        notes: refillDraft.notes.trim() || null
                    });
                    if (error) throw error;
                    setRefillDraft({ prescriptionItemId: '', quantity: '30', notes: '' });
                    setRefillMessage('Refill request sent to your care team.');
                } catch (error) {
                    console.error('Portal refill request failed:', error);
                    setRefillMessage('Your refill request could not be sent. Please try again or contact your care team.');
                } finally {
                    setSubmittingRefill(false);
                }
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
                    <p className="mt-2 text-xs text-slate-500">Documents: <a className="text-medical-700 underline" href="/privacy-notice.html" target="_blank" rel="noreferrer">Draft privacy notice</a> · <a className="text-medical-700 underline" href="/terms.html" target="_blank" rel="noreferrer">Draft terms</a></p>
                    {portalDataError && <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{portalDataError}</p>}

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
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.FileText} onClick={() => setActiveTab('lab_results')}>View Lab Results</Button>
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.CreditCard} onClick={() => setActiveTab('billing')}>Pay Bill</Button>
                                    </div>
                                </Card>
                                <Card title="Medication refill request" className="lg:col-span-3">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <Select label="Prescribed medication" value={refillDraft.prescriptionItemId} onChange={(e) => { setRefillMessage(''); setRefillDraft((prev) => ({ ...prev, prescriptionItemId: e.target.value })); }} options={[{value:'',label:refillItems.length ? 'Select prescribed medication...' : 'No current prescriptions'},...refillItems.map((item) => ({value:item.id,label:`${item.formulary_items?.generic_name || 'Medication'} · ${item.formulary_items?.strength || ''} · ${item.dose} ${item.dose_unit} ${item.route}`}))]} />
                                        <Input label="Quantity" type="number" min="0.01" step="any" value={refillDraft.quantity} onChange={(e) => { setRefillMessage(''); setRefillDraft(prev => ({ ...prev, quantity: e.target.value })); }} />
                                        <Input label="Notes" value={refillDraft.notes} onChange={(e) => setRefillDraft(prev => ({ ...prev, notes: e.target.value }))} />
                                    </div>
                                    {refillMessage && <p role="status" className="mt-3 text-sm text-slate-600">{refillMessage}</p>}
                                    <div className="mt-4 flex justify-end">
                                        <Button variant="primary" icon={Icons.Pill} onClick={handleRequestRefill} disabled={submittingRefill}>{submittingRefill ? 'Sending…' : 'Request refill'}</Button>
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
                                            <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate((appData.appointments || []).filter(a => a.patientId === patient.id && a.date >= formatFacilityDate()).sort((a, b) => a.date.localeCompare(b.date))[0]?.date)}</p>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {activeTab === 'privacy' && (
                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                <Card title="Request access, correction, or restriction" subtitle="The facility will review your request and contact you if it needs more information.">
                                    <div className="space-y-3">
                                        <Select label="Request type" value={privacyRequestType} onChange={(event) => setPrivacyRequestType(event.target.value)} options={[{value:'access',label:'Access to my information'},{value:'correction',label:'Correction of information'},{value:'restriction',label:'Restriction request'}]} />
                                        <TextArea label="Describe your request" rows={5} value={privacyRequestDescription} onChange={(event) => setPrivacyRequestDescription(event.target.value)} />
                                        {privacyRequestMessage && <p role="status" className="text-sm text-slate-700">{privacyRequestMessage}</p>}
                                        <Button variant="primary" onClick={submitPrivacyRequest} disabled={privacyRequestBusy}>{privacyRequestBusy ? 'Submitting…' : 'Submit privacy request'}</Button>
                                    </div>
                                </Card>
                                <Card title="My privacy requests">
                                    {privacyRequests.length ? <div className="space-y-3">{privacyRequests.map((request) => <div key={request.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium capitalize">{request.request_type} · {request.status.replaceAll('_',' ')}</span><span className="text-slate-500">Due {formatDate(request.due_at)}</span></div><p className="mt-1 text-slate-600">{request.description}</p><p className="mt-1 text-xs text-slate-500">Received {formatDate(request.received_at)} · provisional facility schedule</p></div>)}</div> : <p className="text-sm text-slate-500">No requests submitted yet.</p>}
                                </Card>
                            </div>
                        )}

                        {activeTab === 'appointments' && (
                            <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-6">
                                <Card>
                                    <div className="mb-3 flex justify-end">
                                        <Button variant="ghost" size="sm" onClick={async () => {
                                            const client = window.OneMedSupabase?.getClient?.();
                                            if (!client || !patient?.id) { setAppointmentMessage('Appointment status is unavailable. Please try again later.'); return; }
                                            try {
                                                const { data, error } = await client.from('appointments').select('*').eq('patient_id', patient.id).order('appointment_date', { ascending: true });
                                                if (error) throw error;
                                                setAppointmentRequests(normalizeAppointments(data || []));
                                                setAppointmentMessage('Appointment status refreshed.');
                                            } catch (error) {
                                                console.error('Portal appointment refresh failed:', error);
                                                setAppointmentMessage('Appointment status could not be refreshed. Please try again later.');
                                            }
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
                                        {appointmentMessage && <p className={'text-sm ' + (appointmentMessage.startsWith('Request sent') || appointmentMessage.includes('refreshed') ? 'text-emerald-700' : 'text-red-600')}>{appointmentMessage}</p>}
                                        <p className="text-xs text-slate-500">Your preferred date is a request. The Health Information Management (HIM) team will check the doctor’s availability and confirm the date and time here.</p>
                                        <Button variant="primary" icon={Icons.Calendar} disabled={submittingAppointment} onClick={handleBookAppointment}>{submittingAppointment ? 'Sending…' : 'Send appointment request'}</Button>
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
                                        { key: 'results', title: 'Results', render: (row) => row.results && ['final', 'corrected'].includes(row.result_status) ? <Button variant="primary" size="sm" onClick={() => setSelectedLabResult(row)}>View</Button> : 'Pending review' }
                                    ]}
                                    data={appData.labOrders.filter(l => l.patientId === patient.id && ['final', 'corrected'].includes(l.result_status))}
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
                                    <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={async () => { const client = window.OneMedSupabase?.getClient?.(); if (!client) { setMessageError('The messaging service is unavailable.'); return; } try { const { data, error } = await client.from('patient_messages').select('*').eq('patient_id', patient.id).order('sent_at'); if (error) throw error; setPortalMessages((data || []).map((row) => ({ id: row.id, sender: row.sender_name, direction: row.direction, text: row.message, sentAt: row.sent_at }))); setMessageError(''); } catch (error) { console.error('Portal message refresh failed:', error); setMessageError('Messages could not be refreshed. Please try again later.'); } }}>Refresh messages</Button></div>
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
                                        <Button variant="primary" icon={Icons.Send} className="self-end" disabled={sendingMessage} onClick={handleSendMessage}>{sendingMessage ? 'Sending…' : 'Send'}</Button>
                                    </div>
                                </div>
                            </Card>
                        )}
                    </div>
                    <Modal isOpen={!!selectedLabResult} onClose={() => setSelectedLabResult(null)} title={`Laboratory result · ${selectedLabResult?.testType || 'Result'}`} size="md">
                        {selectedLabResult && (() => {
                            const results = selectedLabResult.results;
                            const values = Array.isArray(results?.values)
                                ? results.values
                                : results?.values && typeof results.values === 'object'
                                    ? Object.entries(results.values).map(([parameter, value]) => ({ parameter, value }))
                                    : [];
                            return <div className="space-y-4">
                                <p className="text-sm text-slate-600">Finalized result from {formatDate(selectedLabResult.resultDate)}. Discuss the result with your care team if you have questions.</p>
                                {typeof results === 'string' ? <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{results}</pre> : <>
                                    {values.length > 0 ? <DataTable columns={[{ key: 'parameter', title: 'Test' }, { key: 'value', title: 'Result' }, { key: 'unit', title: 'Unit' }, { key: 'range', title: 'Reference range' }, { key: 'flag', title: 'Flag' }]} data={values} /> : <p className="text-sm text-slate-500">No result values were supplied.</p>}
                                    {results?.comments && <div><h3 className="text-sm font-semibold text-slate-700">Comments</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{results.comments}</p></div>}
                                </>}
                            </div>;
                        })()}
                    </Modal>
                </div>
            );
        };

        // ==========================================

export { PatientPortalModule };
