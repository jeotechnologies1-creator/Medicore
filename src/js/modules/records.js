// ==========================================
// MEDICAL RECORDS MODULE
// Read-only chart index for Records Officers.
// ==========================================
const RecordsModule = () => {
    const { user } = useAuth();
    const [query, setQuery] = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [accessMessage, setAccessMessage] = useState('');
    const [accessError, setAccessError] = useState('');
    const [documentLinks, setDocumentLinks] = useState({});
    const [referrals, setReferrals] = useState([]);
    const [referralError, setReferralError] = useState('');
    const [appointmentRequests, setAppointmentRequests] = useState([]);
    const [appointmentProviders, setAppointmentProviders] = useState([]);
    const [appointmentAssignments, setAppointmentAssignments] = useState({});
    const [appointmentMessage, setAppointmentMessage] = useState('');
    const patients = appData.patients || [];

    useEffect(() => {
        if (!['super_admin', 'records_officer'].includes(user?.role)) return;
        const client = window.OneMedSupabase?.getClient?.();
        if (!client) return;
        client.from('patient_record_referrals').select('id, patient_id, reason, status, created_at, patients(first_name, last_name, patient_number)').order('created_at', { ascending: false }).then(({ data, error }) => {
            if (error) setReferralError(error.message);
            else setReferrals(data || []);
        });
        client.from('appointments').select('*').eq('status', 'requested').order('created_at', { ascending: true }).then(({ data, error }) => {
            if (error) setAppointmentMessage(error.message);
            else {
                const requests = data || [];
                setAppointmentRequests(requests);
                setAppointmentAssignments(Object.fromEntries(requests.map((row) => [row.id, {
                    doctorId: '', date: row.appointment_date || '', time: row.appointment_time || '', doctorConfirmed: false
                }])));
            }
        });
        client.rpc('get_appointment_providers').then(({ data, error }) => {
            if (error) setAppointmentMessage(error.message);
            else setAppointmentProviders(data || []);
        });
    }, [user?.role]);

    const filteredPatients = patients.filter((patient) => {
        const search = query.trim().toLocaleLowerCase();
        if (!search) return true;
        return [patient.firstName, patient.lastName, patient.patientNumber, patient.medicalRecordNumber, patient.phone]
            .some((value) => String(value || '').toLocaleLowerCase().includes(search));
    });

    const openRecord = async (patient) => {
        setAccessMessage('');
        setAccessError('');
        const client = window.OneMedSupabase?.getClient?.();
        if (!client) {
            setAccessError('The patient record could not be opened because the database is unavailable.');
            return;
        }
        try {
            const { error } = await client.schema('public').from('patient_access_logs').insert({
                patient_id: patient.id,
                purpose: 'records_module'
            });
            if (error) throw error;
        } catch (error) {
            const diagnostic = [error?.code, error?.message].filter(Boolean).join(' — ');
            if (['PGRST202', 'PGRST205'].includes(error?.code)) {
                setAccessMessage(`The chart was opened, but this access was not logged (${error.code}).`);
            } else {
                setAccessError(`The chart was not opened because access could not be logged. ${diagnostic}`.trim());
                return;
            }
        }
        setSelectedPatient(patient);
    };

    const markReferralReviewed = async (referral) => {
        const client = window.OneMedSupabase?.getClient?.();
        if (!client) return setReferralError('The referral could not be updated because the database is unavailable.');
        const { data, error } = await client.from('patient_record_referrals').update({ status: 'reviewed', reviewed_at: new Date().toISOString() }).eq('id', referral.id).select().single();
        if (error) return setReferralError(error.message);
        setReferralError('');
        setReferrals((current) => current.map((item) => item.id === referral.id ? { ...item, ...data } : item));
    };

    const resolveAppointmentRequest = async (request, action) => {
        const assignment = appointmentAssignments[request.id] || {};
        if (action === 'scheduled' && (!assignment.doctorId || !assignment.date || !assignment.time || !assignment.doctorConfirmed)) {
            setAppointmentMessage('Confirm the slot with the doctor, then enter the doctor, date, and time before scheduling.');
            return;
        }
        const client = window.OneMedSupabase?.getClient?.();
        if (!client) return setAppointmentMessage('The appointment request could not be updated because the database is unavailable.');
        setAppointmentMessage('');
        const changes = action === 'scheduled'
            ? { status: 'scheduled', doctor_id: assignment.doctorId, appointment_date: assignment.date, appointment_time: assignment.time }
            : { status: 'declined' };
        const { data, error } = await client.from('appointments').update(changes).eq('id', request.id).eq('status', 'requested').select().single();
        if (error) return setAppointmentMessage(error.message);
        setAppointmentRequests((current) => current.filter((row) => row.id !== request.id));
        appData.appointments = (appData.appointments || []).map((row) => row.id === request.id ? { ...row, ...normalizeAppointments([data])[0] } : row);
        setAppointmentMessage(action === 'scheduled' ? 'Appointment confirmed. The patient will see the confirmed date and time in their portal.' : 'Appointment request declined.');
    };

    const createDocumentLink = async (document) => {
        setAccessMessage('');
        setAccessError('');
        const client = window.OneMedSupabase?.getClient?.();
        if (!client) {
            setAccessError('The document link could not be created because the database is unavailable.');
            return;
        }
        try {
            const { error } = await client.schema('public').from('patient_access_logs').insert({
                patient_id: document.patientId,
                purpose: 'records_document'
            });
            if (error) throw error;
        } catch (error) {
            if (['PGRST202', 'PGRST205'].includes(error?.code)) {
                setAccessMessage(`The document link may open, but this access was not logged (${error.code}).`);
            } else {
                setAccessError(`The document link was not created because access could not be logged. ${error?.message || ''}`.trim());
                return;
            }
        }
        try {
            const { data, error } = await window.OneMedSupabase.createDocumentUrl(document.fileUrl);
            if (error || !data?.signedUrl) throw error || new Error('The storage service returned no secure link.');
            setDocumentLinks((links) => ({ ...links, [document.id]: data.signedUrl }));
        } catch (error) {
            setAccessError(`Unable to create a secure document link. ${error?.message || ''}`.trim());
        }
    };

    if (selectedPatient) {
        const patient = patients.find((row) => row.id === selectedPatient.id) || selectedPatient;
        const patientRecords = (rows) => (rows || []).filter((row) => row.patientId === patient.id);
        const allergies = patientRecords(appData.allergies);
        const conditions = patientRecords(appData.conditions);
        const medications = patientRecords(appData.medicationOrders);
        const consultations = patientRecords(appData.consultations);
        const documents = patientRecords(appData.documents);

        return (
            <div className="p-6 space-y-6 animate-fade-in">
                <Button variant="secondary" icon={Icons.ArrowLeft} onClick={() => { setSelectedPatient(null); setAccessMessage(''); }}>
                    Back to records
                </Button>
                {accessMessage && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{accessMessage}</div>}
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Patient record</p>
                        <h2 className="mt-1 text-2xl font-bold text-slate-900">{patient.firstName} {patient.lastName}</h2>
                        <p className="mt-1 text-sm text-slate-500">MRN {patient.medicalRecordNumber || patient.patientNumber || 'Not assigned'}</p>
                    </div>
                    <Badge variant={patient.status === 'active' ? 'success' : 'default'}>{patient.status || 'active'}</Badge>
                </div>
                <div className="grid gap-6 xl:grid-cols-2">
                    <Card title="Demographics">
                        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
                            <div><dt className="text-slate-500">Date of birth</dt><dd className="mt-1 font-medium text-slate-800">{patient.dateOfBirth || 'Not recorded'}</dd></div>
                            <div><dt className="text-slate-500">Gender</dt><dd className="mt-1 font-medium text-slate-800">{patient.gender || 'Not recorded'}</dd></div>
                            <div><dt className="text-slate-500">Phone</dt><dd className="mt-1 font-medium text-slate-800">{patient.phone || 'Not recorded'}</dd></div>
                            <div><dt className="text-slate-500">Email</dt><dd className="mt-1 font-medium text-slate-800">{patient.email || 'Not recorded'}</dd></div>
                            <div className="sm:col-span-2"><dt className="text-slate-500">Address</dt><dd className="mt-1 font-medium text-slate-800">{patient.address || 'Not recorded'}</dd></div>
                        </dl>
                    </Card>
                    <Card title="Clinical record index" subtitle="Read-only summary; updates must be entered by the responsible care team.">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            {[
                                ['Allergies', allergies.length],
                                ['Conditions', conditions.length],
                                ['Medication orders', medications.length],
                                ['Consultation notes', consultations.length],
                                ['Documents', documents.length]
                            ].map(([label, count]) => (
                                <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                                    <p className="text-slate-500">{label}</p>
                                    <p className="mt-1 text-lg font-semibold text-slate-900">{count}</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 space-y-3 text-sm">
                            <div><p className="font-medium text-slate-700">Allergies</p><p className="mt-1 text-slate-600">{allergies.length ? allergies.map((row) => row.substance).filter(Boolean).join(', ') : 'None recorded'}</p></div>
                            <div><p className="font-medium text-slate-700">Conditions</p><p className="mt-1 text-slate-600">{conditions.length ? conditions.map((row) => row.conditionName).filter(Boolean).join(', ') : 'None recorded'}</p></div>
                        </div>
                    </Card>
                </div>
                <Card title="Patient documents" subtitle="Private attachments are opened through short-lived, audited links.">
                    {documents.length ? <div className="divide-y divide-slate-100">
                        {documents.map((document) => (
                            <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                                <div>
                                    <p className="font-medium text-slate-800">{document.fileName}</p>
                                    <p className="text-xs text-slate-500">{document.documentType} · {document.size}</p>
                                </div>
                                {documentLinks[document.id]
                                    ? <div className="flex items-center gap-2"><a href={documentLinks[document.id]} target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-2 text-sm font-medium text-medical-700 hover:bg-medical-50">Open secure link</a><Button size="sm" variant="ghost" onClick={() => createDocumentLink(document)}>Refresh</Button></div>
                                    : <Button size="sm" variant="outline" icon={Icons.FileText} onClick={() => createDocumentLink(document)}>Create secure link</Button>}
                            </div>
                        ))}
                    </div> : <p className="text-sm text-slate-500">No documents have been uploaded for this patient.</p>}
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 animate-fade-in">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Medical Records</h2>
                <p className="mt-1 text-sm text-slate-500">Find a patient and review their read-only chart index.</p>
            </div>
            {accessError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{accessError}</div>}
            {['super_admin', 'records_officer'].includes(user?.role) && <Card title="Patient appointment requests" subtitle="Check the requested department with a doctor, then enter the agreed appointment date and time.">
                {appointmentMessage && <p className="mb-3 text-sm text-slate-700" role="status">{appointmentMessage}</p>}
                {appointmentRequests.length ? <div className="space-y-4">
                    {appointmentRequests.map((request) => {
                        const patient = patients.find((item) => item.id === request.patient_id);
                        const assignment = appointmentAssignments[request.id] || {};
                        return <div key={request.id} className="rounded-xl border border-slate-200 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="font-semibold text-slate-800">{patient ? `${patient.firstName} ${patient.lastName}` : `Patient ${request.patient_id}`}</p>
                                    <p className="text-sm text-slate-600">{request.department || 'Department not specified'} · {request.appointment_type || 'Appointment'}</p>
                                    <p className="mt-1 text-xs text-slate-500">Preferred: {formatDate(request.appointment_date)}{request.appointment_time ? ` at ${request.appointment_time}` : ''}</p>
                                    {request.notes && <p className="mt-2 text-sm text-slate-600">Reason: {request.notes}</p>}
                                </div>
                                <Badge variant="warning">Awaiting scheduling</Badge>
                            </div>
                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                <Select label="Doctor confirmed with" value={assignment.doctorId || ''} onChange={(event) => setAppointmentAssignments((current) => ({ ...current, [request.id]: { ...assignment, doctorId: event.target.value } }))} options={[{ value: '', label: appointmentProviders.length ? 'Select doctor...' : 'No active doctors available' }, ...appointmentProviders.map((provider) => ({ value: provider.id, label: `${provider.full_name}${provider.department ? ` · ${provider.department}` : ''}` }))]} />
                                <Input label="Confirmed date" type="date" value={assignment.date || ''} onChange={(event) => setAppointmentAssignments((current) => ({ ...current, [request.id]: { ...assignment, date: event.target.value } }))} />
                                <Input label="Confirmed time" type="time" value={assignment.time || ''} onChange={(event) => setAppointmentAssignments((current) => ({ ...current, [request.id]: { ...assignment, time: event.target.value } }))} />
                            </div>
                            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={Boolean(assignment.doctorConfirmed)} onChange={(event) => setAppointmentAssignments((current) => ({ ...current, [request.id]: { ...assignment, doctorConfirmed: event.target.checked } }))} className="h-4 w-4 rounded border-slate-300 text-medical-600 focus:ring-medical-500" />
                                I confirmed this appointment slot with the doctor.
                            </label>
                            <div className="mt-3 flex justify-end gap-2">
                                <Button size="sm" variant="ghost" onClick={() => resolveAppointmentRequest(request, 'declined')}>Decline request</Button>
                                <Button size="sm" variant="primary" onClick={() => resolveAppointmentRequest(request, 'scheduled')}>Confirm appointment</Button>
                            </div>
                        </div>;
                    })}
                </div> : <p className="text-sm text-slate-500">There are no appointment requests waiting for scheduling.</p>}
            </Card>}
            {['super_admin', 'records_officer'].includes(user?.role) && <Card title="Patient referrals to Records" subtitle="Administrative requests sent by reception.">
                {referralError && <p className="mb-3 text-sm text-red-600">{referralError}</p>}
                {referrals.length ? <div className="divide-y divide-slate-100">
                    {referrals.map((referral) => <div key={referral.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                            <p className="font-medium text-slate-800">{referral.patients?.first_name} {referral.patients?.last_name} · {referral.patients?.patient_number || referral.patient_id}</p>
                            <p className="text-sm text-slate-600">{referral.reason}</p>
                            <p className="text-xs text-slate-500">{formatDate(referral.created_at)} · {referral.status}</p>
                        </div>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => openRecord(patients.find((patient) => patient.id === referral.patient_id))} disabled={!patients.some((patient) => patient.id === referral.patient_id)}>Open record</Button>
                            {referral.status === 'pending' && <Button size="sm" variant="secondary" onClick={() => markReferralReviewed(referral)}>Mark reviewed</Button>}
                        </div>
                    </div>)}
                </div> : <p className="text-sm text-slate-500">No patient referrals have been sent to Records.</p>}
            </Card>}
            <Card title="Patient index" subtitle={`${filteredPatients.length} of ${patients.length} records`}>
                <div className="mb-4 max-w-lg">
                    <Input label="Search records" placeholder="Name, MRN, patient number, or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Patient</th><th className="px-3 py-3">MRN / Patient No.</th><th className="px-3 py-3">Date of birth</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th></tr></thead>
                        <tbody>
                            {filteredPatients.map((patient) => (
                                <tr key={patient.id} className="border-b border-slate-100">
                                    <td className="px-3 py-3 font-medium text-slate-800">{patient.firstName} {patient.lastName}</td>
                                    <td className="px-3 py-3 text-slate-600">{patient.medicalRecordNumber || patient.patientNumber || '—'}</td>
                                    <td className="px-3 py-3 text-slate-600">{patient.dateOfBirth || '—'}</td>
                                    <td className="px-3 py-3"><Badge variant={patient.status === 'active' ? 'success' : 'default'}>{patient.status || 'active'}</Badge></td>
                                    <td className="px-3 py-3 text-right"><Button size="sm" variant="outline" icon={Icons.FileText} onClick={() => openRecord(patient)}>Open record</Button></td>
                                </tr>
                            ))}
                            {!filteredPatients.length && <tr><td colSpan="5" className="px-3 py-8 text-center text-slate-500">No patient records match this search.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
