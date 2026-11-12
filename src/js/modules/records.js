// ==========================================
// HEALTH INFORMATION MANAGEMENT (HIM) MODULE
// Read-only chart index for Health Information Management staff.
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
    const [portalInbox, setPortalInbox] = useState([]);
    const [portalReplyDrafts, setPortalReplyDrafts] = useState({});
    const [portalInboxMessage, setPortalInboxMessage] = useState('');
    const [bookingForm, setBookingForm] = useState({ patientId: '', doctorId: '', date: '', time: '', department: '', appointmentType: 'consultation', notes: '' });
    const [bookingMessage, setBookingMessage] = useState('');
    const [bookingBusy, setBookingBusy] = useState(false);
    const [familyCards, setFamilyCards] = useState([]);
    const [familyForm, setFamilyForm] = useState({ contactName: '', contactPhone: '', address: '', patientId: '', relationship: 'primary_contact' });
    const [familyMessage, setFamilyMessage] = useState('');
    const [familyBusy, setFamilyBusy] = useState(false);
    const [familyEdits, setFamilyEdits] = useState({});
    const [identityForm, setIdentityForm] = useState({ temporaryPatientId: '', permanentPatientId: '', reason: '' });
    const [patientJourney, setPatientJourney] = useState([]);
    const [recordFiles, setRecordFiles] = useState([]);
    const [fileMovementMessage, setFileMovementMessage] = useState('');
    const [fileRequest, setFileRequest] = useState({ patientId: '', requestingDepartment: '', destinationDepartment: '', receiverName: '', expectedReturnAt: '' });
    const [fileMovementBusy, setFileMovementBusy] = useState(false);
    const [fileRegisterLoading, setFileRegisterLoading] = useState(true);
    const [fileRegisterError, setFileRegisterError] = useState('');
    const [himSummary, setHimSummary] = useState(null);
    const [himPatients, setHimPatients] = useState(appData.patients || []);
    const [patientDirectoryLoading, setPatientDirectoryLoading] = useState(false);
    const [patientDirectoryError, setPatientDirectoryError] = useState('');
    const patients = himPatients;

    useEffect(() => {
        if (!['super_admin', 'records_officer'].includes(user?.role)) return undefined;
        const client = window.OneMedSupabase?.getClient?.();
        if (!client) { setPatientDirectoryError('The patient directory is unavailable because the database is disconnected.'); return undefined; }
        let active = true;
        const loadPatientDirectory = async () => {
            setPatientDirectoryLoading(true);
            setPatientDirectoryError('');
            try {
                const rows = [];
                const pageSize = 250;
                for (let offset = 0; ; offset += pageSize) {
                    const { data, error } = await client.rpc('search_patient_directory', { p_query: '', p_offset: offset, p_limit: pageSize });
                    if (error) throw error;
                    const page = data || [];
                    rows.push(...page);
                    if (page.length < pageSize) break;
                }
                if (active) setHimPatients(rows.map((row) => ({
                    ...row,
                    patientNumber: row.patient_number || '',
                    medicalRecordNumber: row.medical_record_number || '',
                    firstName: row.first_name || '',
                    lastName: row.last_name || '',
                    dateOfBirth: row.date_of_birth || '',
                    registrationDate: row.registration_date || '',
                    homeFacilityId: row.home_facility_id || null
                })));
            } catch (error) {
                if (active) setPatientDirectoryError(`The authorized hospital patient list could not be loaded. ${error?.message || ''}`.trim());
            } finally {
                if (active) setPatientDirectoryLoading(false);
            }
        };
        loadPatientDirectory();
        window.addEventListener('onemed:refresh-data', loadPatientDirectory);
        return () => { active = false; window.removeEventListener('onemed:refresh-data', loadPatientDirectory); };
    }, [user?.id, user?.role]);

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
        client.from('family_cards').select('id,card_number,contact_name,contact_phone,address,status,created_at,family_card_members(id,patient_id,relationship,patients(first_name,last_name,patient_number))').order('created_at', { ascending: false }).then(({ data, error }) => {
            if (error) setFamilyMessage(`Family cards could not be loaded: ${error.message}`);
            else setFamilyCards(data || []);
        });
        client.from('patient_messages').select('*').order('sent_at', { ascending: false }).limit(500).then(({ data, error }) => {
            if (error) setPortalInboxMessage(error.message);
            else setPortalInbox(data || []);
        });
        client.rpc('get_him_dashboard_summary').then(({ data, error }) => {
            if (error) setFileMovementMessage(`HIM summary is unavailable: ${error.message}`);
            else setHimSummary(data || null);
        });
        Promise.all([
            client.from('medical_record_files').select('id,patient_id,facility_id,file_number,status,location,current_custodian,last_retrieved_at,last_returned_at,patients(first_name,last_name,patient_number)').order('updated_at', { ascending: false }).limit(500),
            client.from('medical_record_movements').select('id,file_id,patient_id,requesting_department,destination_department,receiver_name,expected_return_at,released_at,returned_at,status,created_at,patients(first_name,last_name,patient_number)').order('created_at', { ascending: false }).limit(500),
            client.from('medical_record_movement_events').select('id,movement_id,event_type,details,created_at,profiles(full_name)').order('created_at', { ascending: false }).limit(1000)
        ]).then(([files, movements, events]) => {
            const error = files.error || movements.error || events.error;
            if (error) { setFileRegisterError(error.message); setFileRegisterLoading(false); return; }
            setFileRegisterError(''); setFileRegisterLoading(false);
            setRecordFiles((files.data || []).map((file) => ({ ...file, movements: (movements.data || []).filter((row) => row.file_id === file.id), events: (events.data || []).filter((row) => (movements.data || []).some((movement) => movement.file_id === file.id && movement.id === row.movement_id)) })));
        });
    }, [user?.role]);

    const refreshRecordFiles = async () => {
        const client = window.OneMedSupabase?.getClient?.();
        if (!client) return;
        setFileRegisterLoading(true);
        const [files, movements, events] = await Promise.all([
            client.from('medical_record_files').select('id,patient_id,facility_id,file_number,status,location,current_custodian,last_retrieved_at,last_returned_at,patients(first_name,last_name,patient_number)').order('updated_at', { ascending: false }).limit(500),
            client.from('medical_record_movements').select('id,file_id,patient_id,requesting_department,destination_department,receiver_name,expected_return_at,released_at,returned_at,status,created_at,patients(first_name,last_name,patient_number)').order('created_at', { ascending: false }).limit(500),
            client.from('medical_record_movement_events').select('id,movement_id,event_type,details,created_at,profiles(full_name)').order('created_at', { ascending: false }).limit(1000)
        ]);
        const error = files.error || movements.error || events.error;
        if (error) { setFileRegisterError(error.message); setFileRegisterLoading(false); return; }
        setFileRegisterError(''); setFileRegisterLoading(false);
        setRecordFiles((files.data || []).map((file) => ({ ...file, movements: (movements.data || []).filter((row) => row.file_id === file.id), events: (events.data || []).filter((row) => (movements.data || []).some((movement) => movement.file_id === file.id && movement.id === row.movement_id)) })));
        const { data: summary, error: summaryError } = await client.rpc('get_him_dashboard_summary');
        if (summaryError) setFileMovementMessage(summaryError.message); else setHimSummary(summary || null);
    };

    const requestRecordFile = async () => {
        if (!fileRequest.patientId || !fileRequest.requestingDepartment.trim() || !fileRequest.destinationDepartment.trim() || !fileRequest.receiverName.trim()) return setFileMovementMessage('Choose a patient and enter the requesting department, destination department, and receiving officer.');
        setFileMovementBusy(true); setFileMovementMessage('');
        const { error } = await window.OneMedSupabase.getClient().rpc('request_medical_record_file', {
            p_patient_id: fileRequest.patientId,
            p_requesting_department: fileRequest.requestingDepartment.trim(),
            p_destination_department: fileRequest.destinationDepartment.trim(),
            p_expected_return_at: fileRequest.expectedReturnAt ? new Date(fileRequest.expectedReturnAt).toISOString() : null,
            p_receiver_name: fileRequest.receiverName.trim() || null
        });
        setFileMovementBusy(false);
        if (error) return setFileMovementMessage(error.message);
        setFileRequest({ patientId: '', requestingDepartment: '', destinationDepartment: '', receiverName: '', expectedReturnAt: '' });
        setFileMovementMessage('File request recorded. Release it when the physical file is handed over.');
        await refreshRecordFiles();
    };

    const transitionRecordFile = async (movement, action) => {
        const notes = action === 'missing' || action === 'investigate' ? window.prompt('Document the reason or investigation note:') : null;
        if ((action === 'missing' || action === 'investigate') && !String(notes || '').trim()) return;
        const { error } = await window.OneMedSupabase.getClient().rpc('transition_medical_record_movement', { p_movement_id: movement.id, p_action: action, p_notes: notes });
        if (error) return setFileMovementMessage(error.message);
        setFileMovementMessage(`File movement ${action} recorded.`);
        await refreshRecordFiles();
    };

    const replyToPortalMessage = async (message) => {
        const text = String(portalReplyDrafts[message.patient_id] || '').trim();
        if (!text) return;
        const client = window.OneMedSupabase?.getClient?.();
        if (!client) return setPortalInboxMessage('The database is unavailable.');
        const { data, error } = await client.from('patient_messages').insert({ patient_id: message.patient_id, sender_profile_id: user.id, sender_name: user.name || user.fullName || 'HIM team', direction: 'incoming', message: text }).select().single();
        if (error) return setPortalInboxMessage(error.message);
        setPortalInbox((current) => [data, ...current]);
        setPortalReplyDrafts((current) => ({ ...current, [message.patient_id]: '' }));
        setPortalInboxMessage('Reply sent to the patient portal.');
    };

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
            const { data, error } = await client.rpc('read_patient_chart', { p_patient_id: patient.id, p_purpose: 'records_module' });
            if (error) throw error;
            setPatientJourney(data?.encounter_workflow_events || []);
        } catch (error) {
            const diagnostic = [error?.code, error?.message].filter(Boolean).join(' — ');
            setAccessError(`The chart was not opened because the server could not authorize and log the read. ${diagnostic}`.trim());
            return;
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

    const createFamilyCard = async () => {
        if (!familyForm.contactName.trim()) return setFamilyMessage('Enter the authorized primary contact name.');
        setFamilyBusy(true); setFamilyMessage('');
        const client = window.OneMedSupabase?.getClient?.();
        if (!client) { setFamilyBusy(false); return setFamilyMessage('Database connection unavailable.'); }
        const { data, error } = await client.from('family_cards').insert({ contact_name: familyForm.contactName.trim(), contact_phone: familyForm.contactPhone.trim() || null, address: familyForm.address.trim() || null, created_by: user?.id || null }).select().single();
        if (error || !data) { setFamilyBusy(false); return setFamilyMessage(error?.message || 'Family card could not be created.'); }
        let members = [];
        if (familyForm.patientId) {
            const { data: member, error: memberError } = await client.from('family_card_members').insert({ family_card_id: data.id, patient_id: familyForm.patientId, relationship: familyForm.relationship, linked_by: user?.id || null }).select('id,patient_id,relationship,patients(first_name,last_name,patient_number)').single();
            if (memberError) setFamilyMessage(`Family card ${data.card_number} was created, but the patient link failed: ${memberError.message}`);
            else members = [member];
        }
        setFamilyCards((current) => [{ ...data, family_card_members: members }, ...current]);
        setFamilyForm({ contactName: '', contactPhone: '', address: '', patientId: '', relationship: 'primary_contact' });
        setFamilyBusy(false);
    };

    const addFamilyMember = async (card) => {
        if (!familyForm.patientId) return setFamilyMessage('Select a patient to link to this card.');
        const client = window.OneMedSupabase?.getClient?.();
        const { data, error } = await client.from('family_card_members').insert({ family_card_id: card.id, patient_id: familyForm.patientId, relationship: familyForm.relationship, linked_by: user?.id || null }).select('id,patient_id,relationship,patients(first_name,last_name,patient_number)').single();
        if (error || !data) return setFamilyMessage(error?.message || 'The patient could not be linked.');
        setFamilyCards((current) => current.map((item) => item.id === card.id ? { ...item, family_card_members: [...(item.family_card_members || []), data] } : item));
        setFamilyMessage(`Patient linked to family card ${card.card_number}.`);
    };

    const saveFamilyContact = async (card) => {
        const edit = familyEdits[card.id] || card;
        const { data, error } = await window.OneMedSupabase.getClient().from('family_cards').update({ contact_name: String(edit.contact_name ?? card.contact_name).trim(), contact_phone: String(edit.contact_phone ?? card.contact_phone ?? '').trim() || null, address: String(edit.address ?? card.address ?? '').trim() || null, updated_at: new Date().toISOString() }).eq('id', card.id).select().single();
        if (error || !data) return setFamilyMessage(error?.message || 'Family contact changes could not be saved.');
        setFamilyCards((cards) => cards.map((item) => item.id === card.id ? {...item,...data} : item));
        setFamilyEdits((edits) => ({...edits,[card.id]:data}));
        setFamilyMessage(`Family card ${card.card_number} contact details updated.`);
    };

    const verifyTemporaryIdentity = async () => {
        if (!identityForm.temporaryPatientId || !identityForm.permanentPatientId || !identityForm.reason.trim()) return setFamilyMessage('Select both records and document how identity was verified.');
        const { error } = await window.OneMedSupabase.getClient().rpc('merge_unidentified_patient', { p_temporary_patient_id: identityForm.temporaryPatientId, p_permanent_patient_id: identityForm.permanentPatientId, p_reason: identityForm.reason.trim() });
        if (error) return setFamilyMessage(error.message || 'Identity verification was not saved.');
        setFamilyMessage('Temporary encounter history is now linked to the permanent patient record.');
        setIdentityForm({ temporaryPatientId: '', permanentPatientId: '', reason: '' });
        window.dispatchEvent(new CustomEvent('onemed:refresh-data'));
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
        let appointment;
        if (action === 'scheduled') {
            const { data, error } = await client.rpc('confirm_patient_appointment', {
                p_appointment_id: request.id,
                p_doctor_id: assignment.doctorId,
                p_appointment_date: assignment.date,
                p_appointment_time: assignment.time
            });
            if (error) return setAppointmentMessage(error.message);
            appointment = data?.appointment;
        } else {
            const { data, error } = await client.from('appointments').update({ status: 'declined' }).eq('id', request.id).eq('status', 'requested').select().single();
            if (error) return setAppointmentMessage(error.message);
            appointment = data;
        }
        if (!appointment) return setAppointmentMessage('Appointment update returned no booking. Refresh and check the request status.');
        setAppointmentRequests((current) => current.filter((row) => row.id !== request.id));
        const mapped = normalizeAppointments([appointment])[0];
        appData.appointments = (appData.appointments || []).map((row) => row.id === request.id ? { ...row, ...mapped } : row);
        setAppointmentMessage(action === 'scheduled' ? 'Appointment confirmed and an in-app notification was sent to the patient.' : 'Appointment request declined.');
    };

    const bookForPatient = async () => {
        if (!bookingForm.patientId || !bookingForm.doctorId || !bookingForm.date || !bookingForm.time || !bookingForm.department) {
            setBookingMessage('Choose a patient, doctor, department, date, and time.');
            return;
        }
        const client = window.OneMedSupabase?.getClient?.();
        if (!client) return setBookingMessage('The appointment could not be booked because the database is unavailable.');
        setBookingBusy(true);
        setBookingMessage('');
        const { data, error } = await client.rpc('book_patient_appointment', {
            p_patient_id: bookingForm.patientId,
            p_doctor_id: bookingForm.doctorId,
            p_appointment_date: bookingForm.date,
            p_appointment_time: bookingForm.time,
            p_department: bookingForm.department,
            p_appointment_type: bookingForm.appointmentType,
            p_notes: bookingForm.notes || null
        });
        setBookingBusy(false);
        if (error) return setBookingMessage(error.message);
        if (!data?.appointment) return setBookingMessage('No appointment was returned.');
        const mapped = normalizeAppointments([data.appointment])[0];
        appData.appointments = [mapped, ...(appData.appointments || [])];
        setBookingForm({ patientId: '', doctorId: '', date: '', time: '', department: '', appointmentType: 'consultation', notes: '' });
        setBookingMessage('Appointment booked and an in-app notification was sent to the patient.');
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
                <Card title="Patient Journey" subtitle="Timestamped care events, with outstanding work shown separately.">
                    {patientJourney.length ? <ol className="space-y-3">{patientJourney.map((event) => <li key={event.id} className="flex gap-3 border-l-2 border-medical-200 pl-4"><span className="mt-1 h-2 w-2 rounded-full bg-medical-600" /><div><div className="flex flex-wrap items-center gap-2"><span className="font-medium capitalize text-slate-800">{event.event_type.replaceAll('_',' ')}</span><Badge>{event.to_status || 'Recorded'}</Badge></div><p className="text-xs text-slate-500">{formatDateTime(event.created_at)} · {event.department} · Encounter {event.encounter_id.slice(0,8)}</p>{event.notes && <p className="mt-1 text-sm text-slate-600">{event.notes}</p>}</div></li>)}</ol> : <p className="text-sm text-slate-500">No encounter workflow events have been recorded for this patient yet.</p>}
                    <div className="mt-5"><h3 className="mb-2 text-sm font-semibold text-slate-800">Pending actions</h3>{(() => { const tasks = [...(appData.clinicalTasks || []).filter((row) => row.patientId === patient.id && !['completed','cancelled'].includes(row.status)).map((row) => ({label:row.title,status:row.status,department:row.taskType})), ...(appData.labOrders || []).filter((row) => row.patientId === patient.id && row.status !== 'completed').map((row) => ({label:row.testType,status:row.status,department:'Laboratory'})), ...(appData.prescriptions || []).filter((row) => row.patientId === patient.id && !['dispensed','cancelled'].includes(row.status)).map((row) => ({label:row.diagnosis || 'Medication order',status:row.status,department:'Pharmacy'})), ...(appData.admissions || []).filter((row) => row.patientId === patient.id && row.status === 'active').map((row) => ({label:`${row.ward || 'Ward'} admission`,status:'active',department:'Ward / Inpatient'}))]; return tasks.length ? <ul className="flex flex-wrap gap-2">{tasks.map((task,index) => <li key={`${task.department}-${task.label}-${index}`} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{task.department}: {task.label} · {task.status}</li>)}</ul> : <p className="text-sm text-slate-500">No pending actions are shown in connected queues.</p>; })()}</div>
                </Card>
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
                <h2 className="text-2xl font-bold text-slate-900">Health Information Management (HIM)</h2>
                <p className="mt-1 text-sm text-slate-500">Patient information operations and physical file circulation. Counts are aggregated from records you are authorized to access.</p>
            </div>
            {accessError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{accessError}</div>}
            {patientDirectoryError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{patientDirectoryError}</div>}
            {['super_admin', 'records_officer'].includes(user?.role) && <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                {[
                    ['Patients', himSummary?.patients_total], ['Registered today', himSummary?.patients_registered_today], ['New this week', himSummary?.patients_registered_week], ['New this month', himSummary?.patients_registered_month], ['Active patients', himSummary?.patients_active], ['Inactive patients', himSummary?.patients_inactive],
                    ['Files indexed', himSummary?.files_total], ['Files available', himSummary?.files_available], ['In circulation', himSummary?.files_circulating], ['Awaiting release', himSummary?.files_requested], ['Overdue', himSummary?.files_overdue], ['Missing', himSummary?.files_missing], ['Requests today', himSummary?.requests_today], ['Retrieved today', himSummary?.files_retrieved_today], ['Returned today', himSummary?.files_returned_today]
                ].map(([label, value]) => <Card key={label}><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{value == null ? '—' : Number(value).toLocaleString()}</p></Card>)}
            </div>}
            {['super_admin', 'records_officer'].includes(user?.role) && <Card title="Medical record circulation register" subtitle="Facility scoped physical file tracking. Requests, handovers, returns, and missing-file actions are recorded in an append-only event history." action={<Button size="sm" variant="ghost" onClick={refreshRecordFiles}>Refresh</Button>}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6 items-end">
                    <Select label="Patient" value={fileRequest.patientId} disabled={patientDirectoryLoading || Boolean(patientDirectoryError)} onChange={(event) => setFileRequest((current) => ({ ...current, patientId: event.target.value }))} options={[{ value: '', label: patientDirectoryLoading ? 'Loading hospital patients…' : patientDirectoryError ? 'Patient list unavailable' : patients.length ? `Select from ${patients.length.toLocaleString()} patients…` : 'No patients available' }, ...patients.map((patient) => ({ value: patient.id, label: `${patient.firstName} ${patient.lastName} · ${patient.medicalRecordNumber || patient.patientNumber || patient.id.slice(0, 8)}` }))]} />
                    <Input label="Requesting department" value={fileRequest.requestingDepartment} onChange={(event) => setFileRequest((current) => ({ ...current, requestingDepartment: event.target.value }))} />
                    <Input label="Destination department" value={fileRequest.destinationDepartment} onChange={(event) => setFileRequest((current) => ({ ...current, destinationDepartment: event.target.value }))} />
                    <Input label="Receiving officer" value={fileRequest.receiverName} onChange={(event) => setFileRequest((current) => ({ ...current, receiverName: event.target.value }))} />
                    <Input label="Expected return" type="datetime-local" value={fileRequest.expectedReturnAt} onChange={(event) => setFileRequest((current) => ({ ...current, expectedReturnAt: event.target.value }))} />
                    <Button variant="primary" disabled={fileMovementBusy} onClick={requestRecordFile}>{fileMovementBusy ? 'Saving…' : 'Request file'}</Button>
                </div>
                {fileMovementMessage && <p role="status" className="mt-3 text-sm text-slate-700">{fileMovementMessage}</p>}
                <div className="mt-5 overflow-x-auto">
                    {fileRegisterLoading ? <p className="py-6 text-center text-sm text-slate-500">Loading the facility file register…</p>
                    : fileRegisterError ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">The file register could not be loaded: {fileRegisterError}</p>
                    : recordFiles.length ? <table className="w-full text-left text-sm">
                        <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">File / Patient</th><th className="px-3 py-3">Status / Custodian</th><th className="px-3 py-3">Latest movement</th><th className="px-3 py-3">Due</th><th className="px-3 py-3">Actions</th></tr></thead>
                        <tbody>{recordFiles.map((file) => {
                            const movement = file.movements?.find((row) => ['requested', 'in_circulation', 'missing', 'under_investigation'].includes(row.status)) || file.movements?.[0];
                            const overdue = movement?.status === 'in_circulation' && movement.expected_return_at && new Date(movement.expected_return_at) < new Date();
                            const patientName = `${file.patients?.first_name || ''} ${file.patients?.last_name || ''}`.trim() || file.patient_id;
                            return <tr key={file.id} className="border-b border-slate-100 align-top">
                                <td className="px-3 py-3"><p className="font-medium text-slate-800">{file.file_number}</p><p className="text-xs text-slate-500">{patientName} · {file.patients?.patient_number || file.patient_id.slice(0, 8)}</p></td>
                                <td className="px-3 py-3"><Badge variant={overdue || file.status === 'missing' ? 'warning' : file.status === 'available' ? 'success' : 'default'}>{overdue ? 'overdue' : file.status.replaceAll('_', ' ')}</Badge><p className="mt-1 text-xs text-slate-500">{file.current_custodian || file.location || 'No custodian recorded'}</p></td>
                                <td className="px-3 py-3">{movement ? <><p className="font-medium">{movement.requesting_department} → {movement.destination_department}</p><p className="text-xs text-slate-500">{movement.status.replaceAll('_', ' ')} · {formatDateTime(movement.released_at || movement.created_at)}</p><details className="mt-1"><summary className="cursor-pointer text-xs text-medical-700">Movement history ({file.events?.length || 0})</summary><ul className="mt-2 space-y-1 text-xs text-slate-600">{(file.events || []).filter((event) => event.movement_id === movement.id).map((event) => <li key={event.id}>{event.event_type.replaceAll('_', ' ')} · {formatDateTime(event.created_at)} · {event.profiles?.full_name || 'Staff'}</li>)}</ul></details></> : <span className="text-slate-500">No movement recorded</span>}</td>
                                <td className="px-3 py-3 text-slate-600">{movement?.expected_return_at ? formatDateTime(movement.expected_return_at) : '—'}</td>
                                <td className="px-3 py-3"><div className="flex flex-wrap gap-2">{movement?.status === 'requested' && <><Button size="sm" variant="primary" onClick={() => transitionRecordFile(movement, 'release')}>Release</Button><Button size="sm" variant="ghost" onClick={() => transitionRecordFile(movement, 'reject')}>Reject</Button></>}{movement?.status === 'in_circulation' && <><Button size="sm" variant="secondary" onClick={() => transitionRecordFile(movement, 'return')}>Return</Button><Button size="sm" variant="ghost" onClick={() => transitionRecordFile(movement, 'missing')}>Mark missing</Button></>}{movement?.status === 'missing' && <Button size="sm" variant="outline" onClick={() => transitionRecordFile(movement, 'investigate')}>Start investigation</Button>}{movement?.status === 'under_investigation' && <Button size="sm" variant="outline" onClick={() => transitionRecordFile(movement, 'located')}>Record located</Button>}{!movement && <span className="text-xs text-slate-500">Available for request</span>}</div></td>
                            </tr>;
                        })}</tbody>
                    </table> : <p className="py-6 text-center text-sm text-slate-500">No physical files have been registered yet. The first approved request creates the existing patient’s HIM file index.</p>}
                </div>
            </Card>}
            {['super_admin', 'records_officer'].includes(user?.role) && <Card title="Book an appointment for a patient" subtitle="Confirm the date and time with the doctor before booking. The patient must have an active portal account to receive the in-app notification.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Select label="Patient" value={bookingForm.patientId} onChange={(event) => setBookingForm((current) => ({ ...current, patientId: event.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...patients.map((patient) => ({ value: patient.id, label: `${patient.firstName} ${patient.lastName} · ${patient.patientNumber || patient.id}` }))]} />
                    <Select label="Doctor" value={bookingForm.doctorId} onChange={(event) => setBookingForm((current) => ({ ...current, doctorId: event.target.value }))} options={[{ value: '', label: appointmentProviders.length ? 'Select doctor...' : 'No active doctors available' }, ...appointmentProviders.map((provider) => ({ value: provider.id, label: `${provider.full_name}${provider.department ? ` · ${provider.department}` : ''}` }))]} />
                    <Input label="Department" value={bookingForm.department} onChange={(event) => setBookingForm((current) => ({ ...current, department: event.target.value }))} />
                    <Select label="Appointment type" value={bookingForm.appointmentType} onChange={(event) => setBookingForm((current) => ({ ...current, appointmentType: event.target.value }))} options={[{ value: 'consultation', label: 'Consultation' }, { value: 'follow_up', label: 'Follow-up' }, { value: 'review', label: 'Review' }, { value: 'procedure', label: 'Procedure' }]} />
                    <Input label="Approved date" type="date" value={bookingForm.date} onChange={(event) => setBookingForm((current) => ({ ...current, date: event.target.value }))} />
                    <Input label="Approved time" type="time" value={bookingForm.time} onChange={(event) => setBookingForm((current) => ({ ...current, time: event.target.value }))} />
                    <div className="md:col-span-2"><Input label="Patient note (optional)" value={bookingForm.notes} onChange={(event) => setBookingForm((current) => ({ ...current, notes: event.target.value }))} /></div>
                </div>
                {bookingMessage && <p className={'mt-3 text-sm ' + (bookingMessage.includes('notification was sent') ? 'text-emerald-700' : 'text-red-600')}>{bookingMessage}</p>}
                <div className="mt-4 flex justify-end"><Button variant="primary" onClick={bookForPatient} disabled={bookingBusy}>{bookingBusy ? 'Booking appointment...' : 'Book and notify patient'}</Button></div>
            </Card>}
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
            {['super_admin', 'records_officer'].includes(user?.role) && <Card title="Patient portal chat inbox" subtitle="Messages from patients at facilities where you have the portal.message.read and portal.message.reply permissions.">
                <div className="mb-3 flex justify-end"><Button size="sm" variant="ghost" onClick={async () => { const client = window.OneMedSupabase?.getClient?.(); if (!client) return setPortalInboxMessage('The database is unavailable.'); const { data, error } = await client.from('patient_messages').select('*').order('sent_at', { ascending: false }).limit(500); if (error) setPortalInboxMessage(error.message); else { setPortalInbox(data || []); setPortalInboxMessage('Inbox refreshed.'); } }}>Refresh inbox</Button></div>
                {portalInboxMessage && <p role="status" className="mb-3 text-sm text-slate-600">{portalInboxMessage}</p>}
                {portalInbox.length ? <div className="space-y-4">{[...new Map(portalInbox.map((message) => [message.patient_id, message.patient_id])).keys()].map((patientId) => {
                    const thread = portalInbox.filter((message) => message.patient_id === patientId).sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
                    const patient = patients.find((item) => item.id === patientId);
                    const latest = thread[thread.length - 1];
                    return <section key={patientId} className="rounded-xl border border-slate-200 p-4">
                        <div className="mb-3 flex items-center justify-between"><p className="font-semibold text-slate-800">{patient ? `${patient.firstName} ${patient.lastName}` : `Patient ${patientId}`}</p><span className="text-xs text-slate-500">{thread.length} messages</span></div>
                        <div className="max-h-64 space-y-2 overflow-y-auto">{thread.map((message) => <div key={message.id} className={`rounded-lg p-3 text-sm ${message.direction === 'outgoing' ? 'bg-slate-50' : 'bg-medical-50'}`}><div className="flex justify-between gap-2"><span className="font-medium">{message.sender_name}</span><time className="text-xs text-slate-500">{new Date(message.sent_at).toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap">{message.message}</p></div>)}</div>
                        <div className="mt-3 flex gap-2"><textarea value={portalReplyDrafts[patientId] || ''} onChange={(event) => setPortalReplyDrafts((current) => ({ ...current, [patientId]: event.target.value }))} rows={2} placeholder={`Reply to ${patient?.firstName || 'patient'}...`} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><Button size="sm" variant="primary" onClick={() => replyToPortalMessage(latest)}>Reply</Button></div>
                    </section>;
                })}</div> : <p className="text-sm text-slate-500">No portal messages are available to your HIM account.</p>}
            </Card>}
            {['super_admin', 'records_officer'].includes(user?.role) && <Card title="Patient referrals to Health Information Management (HIM)" subtitle="Administrative requests sent by reception.">
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
                </div> : <p className="text-sm text-slate-500">No patient referrals have been sent to HIM.</p>}
            </Card>}
            {['super_admin', 'records_officer'].includes(user?.role) && <Card title="Family Card Management" subtitle="Group identification and contact details; each member retains an individual medical record.">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
                    <Input label="Primary contact" value={familyForm.contactName} onChange={(event) => setFamilyForm((form) => ({ ...form, contactName: event.target.value }))} />
                    <Input label="Contact phone" value={familyForm.contactPhone} onChange={(event) => setFamilyForm((form) => ({ ...form, contactPhone: event.target.value }))} />
                    <Input label="Address" value={familyForm.address} onChange={(event) => setFamilyForm((form) => ({ ...form, address: event.target.value }))} />
                    <Select label="Link patient (optional)" value={familyForm.patientId} onChange={(event) => setFamilyForm((form) => ({ ...form, patientId: event.target.value }))} options={[{value:'',label:'No initial member'},...patients.map((patient) => ({value:patient.id,label:`${patient.firstName} ${patient.lastName} · ${patient.patientNumber || patient.id.slice(0,8)}`}))]} />
                    <Button variant="primary" disabled={familyBusy} onClick={createFamilyCard}>{familyBusy ? 'Saving…' : 'Create family card'}</Button>
                </div>
                {familyForm.patientId && <div className="mt-3 max-w-xs"><Select label="Relationship" value={familyForm.relationship} onChange={(event) => setFamilyForm((form) => ({ ...form, relationship: event.target.value }))} options={['primary_contact','parent','child','spouse','guardian','sibling','other'].map((value) => ({value,label:value.replace('_',' ')}))} /></div>}
                {familyMessage && <p className="mt-3 text-sm text-slate-700" role="status">{familyMessage}</p>}
                <div className="mt-5 space-y-3">{familyCards.map((card) => {const edit=familyEdits[card.id] || card;return <div key={card.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-900">{card.card_number} · {card.contact_name}</p><p className="text-sm text-slate-500">{card.contact_phone || 'No phone'} · {card.address || 'No address'}</p></div><div className="flex gap-2"><Badge variant="success">{card.status}</Badge><Button size="sm" variant="outline" onClick={() => window.print()}>Print</Button></div></div><div className="mt-3 flex flex-wrap items-end gap-3">{(card.family_card_members || []).map((member) => <span key={member.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{member.patients?.first_name} {member.patients?.last_name} · {member.relationship}</span>)}<Select label="Patient" value={familyForm.patientId} onChange={(event) => setFamilyForm((form) => ({ ...form, patientId: event.target.value }))} options={[{value:'',label:'Select patient to link'},...patients.filter((patient) => !(card.family_card_members || []).some((member) => member.patient_id === patient.id)).map((patient) => ({value:patient.id,label:`${patient.firstName} ${patient.lastName}`}))]} /><Select label="Relationship" value={familyForm.relationship} onChange={(event) => setFamilyForm((form) => ({ ...form, relationship: event.target.value }))} options={['parent','child','spouse','guardian','sibling','other'].map((value) => ({value,label:value}))} /><Button size="sm" variant="outline" onClick={() => addFamilyMember(card)}>Link member</Button></div><div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"><Input label="Update primary contact" value={edit.contact_name || ''} onChange={(event) => setFamilyEdits((values) => ({...values,[card.id]:{...edit,contact_name:event.target.value}}))} /><Input label="Update phone" value={edit.contact_phone || ''} onChange={(event) => setFamilyEdits((values) => ({...values,[card.id]:{...edit,contact_phone:event.target.value}}))} /><Input label="Update address" value={edit.address || ''} onChange={(event) => setFamilyEdits((values) => ({...values,[card.id]:{...edit,address:event.target.value}}))} /><Button size="sm" variant="secondary" onClick={() => saveFamilyContact(card)}>Save contact changes</Button></div></div>;})}</div>
            </Card>}
            {['super_admin','records_officer'].includes(user?.role) && (patients.some((patient) => patient.identity_status === 'unidentified' || patient.identityStatus === 'unidentified')) && <Card title="Emergency identity verification" subtitle="Link a temporary unidentified record to a verified patient after checking identity. The temporary record remains as a traceable merge record.">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-end"><Select label="Temporary emergency record" value={identityForm.temporaryPatientId} onChange={(event) => setIdentityForm((form) => ({...form,temporaryPatientId:event.target.value}))} options={[{value:'',label:'Select temporary record'},...patients.filter((patient) => patient.identity_status === 'unidentified' || patient.identityStatus === 'unidentified').map((patient) => ({value:patient.id,label:`${patient.patientNumber} · ${patient.firstName} ${patient.lastName}`}))]} /><Select label="Verified permanent record" value={identityForm.permanentPatientId} onChange={(event) => setIdentityForm((form) => ({...form,permanentPatientId:event.target.value}))} options={[{value:'',label:'Select verified patient'},...patients.filter((patient) => patient.identity_status !== 'unidentified' && patient.identityStatus !== 'unidentified' && patient.id !== identityForm.temporaryPatientId).map((patient) => ({value:patient.id,label:`${patient.firstName} ${patient.lastName} · ${patient.patientNumber || patient.id.slice(0,8)}`}))]} /><Input label="Identity verification reason" value={identityForm.reason} onChange={(event) => setIdentityForm((form) => ({...form,reason:event.target.value}))} /><Button variant="primary" onClick={verifyTemporaryIdentity}>Verify and link records</Button></div>
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
