// ==========================================
// MEDICAL RECORDS MODULE
// Read-only chart index for Records Officers.
// ==========================================
const RecordsModule = () => {
    const [query, setQuery] = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [accessMessage, setAccessMessage] = useState('');
    const [accessError, setAccessError] = useState('');
    const [documentLinks, setDocumentLinks] = useState({});
    const patients = appData.patients || [];

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
