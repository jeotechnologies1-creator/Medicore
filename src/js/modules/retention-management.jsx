const retentionCategories = [
    'admissions', 'encounters', 'consultations', 'prescriptions', 'patient_allergies', 'patient_conditions', 'lab_orders', 'radiology_orders',
    'surgeries', 'nursing_notes', 'emergency_visits', 'intake_output_records', 'pain_assessments', 'patient_documents', 'patient_messages',
    'patient_next_of_kin', 'medication_orders', 'medication_administrations', 'patient_consents', 'clinical_alerts', 'care_plans',
    'clinical_tasks', 'appointments', 'billing', 'insurance_claims'
];

const RetentionManagementPanel = ({ patients = [] }) => {
    const { user } = useAuth();
    const client = window.OneMedSupabase?.getClient?.();
    const facilityId = user?.facility_id || user?.facilityId || '';
    const [schedules, setSchedules] = useState([]);
    const [holds, setHolds] = useState([]);
    const [requests, setRequests] = useState([]);
    const [archives, setArchives] = useState([]);
    const [certificates, setCertificates] = useState([]);
    const [scheduleDraft, setScheduleDraft] = useState({ category: 'encounters', days: '', basis: '' });
    const [holdDraft, setHoldDraft] = useState({ patientId: '', category: '', caseReference: '', reason: '', authorityBasis: '' });
    const [actionDraft, setActionDraft] = useState({ patientId: '', category: 'encounters', recordId: '', action: 'archive', reason: '' });
    const [notes, setNotes] = useState({});
    const [holdReleaseReasons, setHoldReleaseReasons] = useState({});
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        if (!client || !facilityId) { setLoading(false); setError('Retention management requires an active facility connection.'); return; }
        setLoading(true);
        const [scheduleResult, holdResult, requestResult, archiveResult, certificateResult] = await Promise.all([
            client.from('retention_schedule').select('*').or(`facility_id.eq.${facilityId},facility_id.is.null`).order('record_category'),
            client.from('legal_holds').select('*').or(`facility_id.eq.${facilityId},facility_id.is.null`).order('placed_at', { ascending: false }),
            client.from('retention_action_requests').select('*').eq('facility_id', facilityId).order('requested_at', { ascending: false }),
            client.from('record_archive_registry').select('*').eq('facility_id', facilityId).order('recorded_at', { ascending: false }),
            client.from('disposal_certificates').select('*').eq('facility_id', facilityId).order('issued_at', { ascending: false })
        ]);
        const failed = [scheduleResult, holdResult, requestResult, archiveResult, certificateResult].find((result) => result.error);
        if (failed) setError('Retention records could not be loaded. Check Records Officer facility access.');
        else {
            setSchedules(scheduleResult.data || []); setHolds(holdResult.data || []); setRequests(requestResult.data || []);
            setArchives(archiveResult.data || []); setCertificates(certificateResult.data || []); setError('');
        }
        setLoading(false);
    }, [client, facilityId]);

    useEffect(() => { refresh(); }, [refresh]);

    const runRpc = async (name, args, success) => {
        if (!client) return setError('Database connection is unavailable.');
        setBusy(true); setError(''); setMessage('');
        const { data, error: rpcError } = await client.rpc(name, args);
        setBusy(false);
        if (rpcError) setError(rpcError.message || 'The retention workflow could not be saved.');
        else {
            const statusMessage = typeof data === 'string' && data === 'blocked_by_legal_hold' ? 'Action blocked by an active legal hold.' : success;
            setMessage(statusMessage); await refresh();
        }
    };

    const configureSchedule = (event) => {
        event.preventDefault();
        runRpc('configure_retention_schedule', {
            p_facility_id: facilityId, p_record_category: scheduleDraft.category,
            p_retention_days: scheduleDraft.days === '' ? null : Number(scheduleDraft.days), p_retention_basis: scheduleDraft.basis
        }, 'A new retention schedule version was recorded and awaits independent approval.');
        setScheduleDraft((current) => ({ ...current, days: '', basis: '' }));
    };
    const approveSchedule = (schedule) => runRpc('approve_retention_schedule', { p_schedule_id: schedule.id }, 'Retention schedule approved.');
    const placeHold = (event) => {
        event.preventDefault();
        const patientId = holdDraft.patientId || null;
        if (!patientId && !holdDraft.category) return setError('Select a patient or record category to define the legal hold scope.');
        runRpc('place_legal_hold_case', {
            p_patient_id: patientId, p_facility_id: facilityId, p_record_category: holdDraft.category || null,
            p_case_reference: holdDraft.caseReference || null, p_reason: holdDraft.reason, p_authority_basis: holdDraft.authorityBasis
        }, 'Legal hold case placed and recorded.');
        setHoldDraft({ patientId: '', category: '', caseReference: '', reason: '', authorityBasis: '' });
    };
    const releaseHold = (hold) => {
        const reason = holdReleaseReasons[hold.id]?.trim();
        if (!reason || reason.length < 10) return setError('Record a release reason of at least 10 characters.');
        runRpc('release_legal_hold', { p_hold_id: hold.id, p_reason: reason }, 'Legal hold released and recorded.');
    };
    const requestAction = (event) => {
        event.preventDefault();
        runRpc('request_retention_action', {
            p_patient_id: actionDraft.patientId || null, p_record_category: actionDraft.category,
            p_record_id: actionDraft.recordId, p_action: actionDraft.action, p_reason: actionDraft.reason
        }, 'Retention action request recorded for independent review.');
        setActionDraft((current) => ({ ...current, recordId: '', reason: '' }));
    };
    const decide = (request, approve) => runRpc('approve_retention_action', {
        p_request_id: request.id, p_approve: approve, p_note: notes[request.id] || null
    }, approve ? (request.action === 'dispose' ? 'First disposal approval recorded.' : 'Archive approval recorded.') : 'Retention action rejected.');
    const secondApprove = (request) => runRpc('approve_retention_disposal', {
        p_request_id: request.id, p_approve: true, p_note: notes[request.id] || null
    }, 'Independent second disposal approval recorded.');
    const execute = (request) => runRpc('execute_retention_action', { p_request_id: request.id }, request.action === 'dispose'
        ? 'Record sealed and immutable disposal certificate issued. Source clinical data remains retained.'
        : 'Record archived in the retention registry. Source data remains retained.');

    const patientName = (id) => {
        const patient = patients.find((row) => row.id === id);
        return patient ? `${patient.firstName || patient.first_name || ''} ${patient.lastName || patient.last_name || ''}`.trim() || id : id || 'Facility-wide';
    };
    const matchingHolds = (request) => holds.filter((hold) => hold.status === 'active'
        && (hold.patient_id == null || hold.patient_id === request.patient_id)
        && (hold.record_category == null || hold.record_category === request.record_category)
        && (hold.facility_id == null || hold.facility_id === request.facility_id));
    const isHeld = (request) => request.status === 'blocked_by_legal_hold' || matchingHolds(request).length > 0;

    return <section className="space-y-6" aria-label="Retention schedules and legal holds">
        <div><h2 className="text-xl font-bold text-slate-900">Retention schedules and legal holds</h2><p className="mt-1 text-sm text-slate-600">Configure documented schedules, manage hold cases, and archive or seal records through independent review. Clinical source data is retained.</p></div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={refresh}>Refresh retention records</Button></div>
        <Card title="Retention schedule configuration" subtitle="No retention duration is preselected. Each version needs a documented basis and approval by a different Records Officer.">
            <form className="grid gap-3 md:grid-cols-3" onSubmit={configureSchedule}>
                <label className="text-sm">Record category<select className="mt-1 w-full rounded border p-2" value={scheduleDraft.category} onChange={(event) => setScheduleDraft((value) => ({ ...value, category: event.target.value }))}>{retentionCategories.map((category) => <option key={category} value={category}>{category.replaceAll('_', ' ')}</option>)}</select></label>
                <label className="text-sm">Retention days<input type="number" min="1" className="mt-1 w-full rounded border p-2" value={scheduleDraft.days} onChange={(event) => setScheduleDraft((value) => ({ ...value, days: event.target.value }))} placeholder="Not configured" /></label>
                <label className="text-sm">Documented policy / legal basis<input required className="mt-1 w-full rounded border p-2" value={scheduleDraft.basis} onChange={(event) => setScheduleDraft((value) => ({ ...value, basis: event.target.value }))} /></label>
                <div className="md:col-span-3"><Button type="submit" disabled={busy}>Save schedule version</Button><p className="mt-1 text-xs text-slate-500">A schedule without days can be recorded for review but cannot be approved or used to determine eligibility.</p></div>
            </form>
            {loading ? <p className="mt-4 text-sm text-slate-500">Loading retention schedules…</p> : schedules.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Category / version</th><th className="p-2">Duration</th><th className="p-2">Basis</th><th className="p-2">State</th><th className="p-2">Approval</th></tr></thead><tbody>{schedules.map((schedule) => <tr className="border-b" key={schedule.id}><td className="p-2">{schedule.record_category.replaceAll('_', ' ')} · v{schedule.version}{schedule.active ? ' · active' : ' · superseded'}</td><td className="p-2">{schedule.retention_days == null ? 'Not configured' : `${schedule.retention_days} days`}</td><td className="p-2">{schedule.retention_basis}</td><td className="p-2">{schedule.approved ? 'Approved' : 'Awaiting approval'}</td><td className="p-2">{!schedule.approved && <Button size="sm" onClick={() => approveSchedule(schedule)} disabled={busy || schedule.retention_days == null || schedule.configured_by === user?.id}>Approve version</Button>}{schedule.configured_by === user?.id && !schedule.approved && <p className="mt-1 text-xs text-amber-700">A different reviewer must approve this version.</p>}</td></tr>)}</tbody></table></div> : <p className="mt-4 rounded bg-slate-50 p-4 text-sm text-slate-600">No retention schedules are configured for this facility. No default duration is applied.</p>}
        </Card>
        <Card title="Legal hold case management" subtitle="Hold scope may cover a patient, a record category, or both. Active matching holds block retention actions.">
            <form className="grid gap-3 md:grid-cols-2" onSubmit={placeHold}>
                <label className="text-sm">Patient scope<select className="mt-1 w-full rounded border p-2" value={holdDraft.patientId} onChange={(event) => setHoldDraft((value) => ({ ...value, patientId: event.target.value }))}><option value="">Facility or category-wide hold</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{`${patient.firstName || patient.first_name || ''} ${patient.lastName || patient.last_name || ''}`.trim() || patient.patientNumber || patient.patient_number || patient.id}</option>)}</select></label>
                <label className="text-sm">Record category scope<select className="mt-1 w-full rounded border p-2" value={holdDraft.category} onChange={(event) => setHoldDraft((value) => ({ ...value, category: event.target.value }))}><option value="">All categories</option>{retentionCategories.map((category) => <option key={category} value={category}>{category.replaceAll('_', ' ')}</option>)}</select></label>
                <label className="text-sm">Case reference<input className="mt-1 w-full rounded border p-2" value={holdDraft.caseReference} onChange={(event) => setHoldDraft((value) => ({ ...value, caseReference: event.target.value }))} /></label>
                <label className="text-sm">Authority basis<input required className="mt-1 w-full rounded border p-2" value={holdDraft.authorityBasis} onChange={(event) => setHoldDraft((value) => ({ ...value, authorityBasis: event.target.value }))} /></label>
                <label className="text-sm md:col-span-2">Hold reason<textarea required minLength="10" rows="2" className="mt-1 w-full rounded border p-2" value={holdDraft.reason} onChange={(event) => setHoldDraft((value) => ({ ...value, reason: event.target.value }))} /></label>
                <div><Button type="submit" disabled={busy}>Place legal hold</Button></div>
            </form>
            {holds.length ? <div className="mt-4 space-y-3">{holds.map((hold) => <article key={hold.id} className="rounded-lg border p-3"><div className="flex flex-wrap justify-between gap-2"><strong>{hold.case_reference || `Hold ${hold.id.slice(0, 8)}`}</strong><Badge variant={hold.status === 'active' ? 'danger' : 'success'}>{hold.status}</Badge></div><p className="mt-1 text-sm">{patientName(hold.patient_id)} · {hold.record_category?.replaceAll('_', ' ') || 'all record categories'}</p><p className="text-sm text-slate-600">{hold.reason} · Authority: {hold.authority_basis || '—'}</p><p className="text-xs text-slate-500">Placed {formatDateTime(hold.placed_at)}</p>{hold.status === 'active' && <div className="mt-2 flex flex-wrap gap-2"><input aria-label={`Release reason for ${hold.case_reference || hold.id}`} className="min-w-64 flex-1 rounded border p-2 text-sm" value={holdReleaseReasons[hold.id] || ''} onChange={(event) => setHoldReleaseReasons((current) => ({ ...current, [hold.id]: event.target.value }))} placeholder="Document reason for releasing this hold" /><Button size="sm" variant="secondary" onClick={() => releaseHold(hold)} disabled={busy || hold.placed_by === user?.id}>Release hold</Button></div>}{hold.status === 'active' && hold.placed_by === user?.id && <p className="mt-1 text-xs text-amber-700">A different authorized officer must release this hold.</p>}</article>)}</div> : <p className="mt-4 text-sm text-slate-500">No legal hold cases are recorded for this facility.</p>}
        </Card>
        <Card title="Request archive or disposal review" subtitle="Enter an existing record identifier. The database validates eligibility, schedule coverage, and active holds before creating a request.">
            <form className="grid gap-3 md:grid-cols-2" onSubmit={requestAction}>
                <label className="text-sm">Patient (if applicable)<select className="mt-1 w-full rounded border p-2" value={actionDraft.patientId} onChange={(event) => setActionDraft((value) => ({ ...value, patientId: event.target.value }))}><option value="">No patient link</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{`${patient.firstName || patient.first_name || ''} ${patient.lastName || patient.last_name || ''}`.trim() || patient.patientNumber || patient.patient_number || patient.id}</option>)}</select></label>
                <label className="text-sm">Record category<select className="mt-1 w-full rounded border p-2" value={actionDraft.category} onChange={(event) => setActionDraft((value) => ({ ...value, category: event.target.value }))}>{retentionCategories.map((category) => <option key={category} value={category}>{category.replaceAll('_', ' ')}</option>)}</select></label>
                <label className="text-sm">Record ID<input required className="mt-1 w-full rounded border p-2" value={actionDraft.recordId} onChange={(event) => setActionDraft((value) => ({ ...value, recordId: event.target.value }))} /></label>
                <label className="text-sm">Action<select className="mt-1 w-full rounded border p-2" value={actionDraft.action} onChange={(event) => setActionDraft((value) => ({ ...value, action: event.target.value }))}><option value="archive">Archive metadata</option><option value="dispose">Seal and issue disposal certificate</option></select></label>
                <label className="text-sm md:col-span-2">Reason<textarea required minLength="10" rows="2" className="mt-1 w-full rounded border p-2" value={actionDraft.reason} onChange={(event) => setActionDraft((value) => ({ ...value, reason: event.target.value }))} /></label>
                <div className="md:col-span-2"><Button type="submit" disabled={busy}>Submit retention request</Button></div>
            </form>
            {requests.length ? <div className="mt-5 space-y-3">{requests.map((request) => {
                const held = isHeld(request);
                const matching = matchingHolds(request);
                const isRequester = request.requested_by === user?.id;
                const isFirstApprover = request.first_approved_by === user?.id;
                return <article key={request.id} className={`rounded-lg border p-4 ${held ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{request.record_category.replaceAll('_', ' ')} · {request.record_id}</h3><p className="text-sm text-slate-600">{request.action === 'dispose' ? 'Seal and certify' : 'Archive'} · {patientName(request.patient_id)} · {request.reason}</p><p className="text-xs text-slate-500">Requested {formatDateTime(request.requested_at)} · {request.status.replaceAll('_', ' ')}</p></div><Badge variant={held ? 'danger' : request.status === 'executed' ? 'success' : 'warning'}>{held ? 'blocked by legal hold' : request.status.replaceAll('_', ' ')}</Badge></div>
                    {held && <p className="mt-2 text-sm font-medium text-amber-900">Blocked by active hold{matching.length ? `: ${matching.map((hold) => hold.case_reference || hold.id.slice(0, 8)).join(', ')}` : ''}. No archive or disposal action is available.</p>}
                    {request.decision_note && <p className="mt-1 text-sm text-slate-600">Review note: {request.decision_note}</p>}
                    {['pending', 'first_approved'].includes(request.status) && <label className="mt-3 block text-sm">Approval note<textarea rows="2" className="mt-1 w-full rounded border p-2" value={notes[request.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} /></label>}
                    {request.status === 'pending' && <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => decide(request, true)} disabled={busy || held || isRequester}>Approve first step</Button><Button size="sm" variant="ghost" onClick={() => decide(request, false)} disabled={busy || isRequester}>Reject</Button>{isRequester && <p className="w-full text-xs text-amber-700">The requester cannot review their own action.</p>}</div>}
                    {request.status === 'first_approved' && request.action === 'dispose' && <div className="mt-2"><Button size="sm" onClick={() => secondApprove(request)} disabled={busy || held || isRequester || isFirstApprover}>Approve disposal as second reviewer</Button>{(isRequester || isFirstApprover) && <p className="mt-1 text-xs text-amber-700">Second approval must come from someone other than the requester and first approver.</p>}</div>}
                    {request.status === 'approved' && <div className="mt-2"><Button size="sm" onClick={() => execute(request)} disabled={busy || held}>{request.action === 'dispose' ? 'Seal record and issue certificate' : 'Record archive state'}</Button><p className="mt-1 text-xs text-slate-500">The source record remains stored; this action only records archive or sealed status.</p></div>}
                </article>;
            })}</div> : <p className="mt-4 text-sm text-slate-500">No archive or disposal requests are recorded for this facility.</p>}
        </Card>
        <Card title="Archive registry" subtitle="Archive and sealed states record retention disposition without deleting the source clinical data.">
            {archives.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Record</th><th className="p-2">Patient</th><th className="p-2">State</th><th className="p-2">Recorded</th><th className="p-2">Note</th></tr></thead><tbody>{archives.map((entry) => <tr className="border-b" key={`${entry.record_category}-${entry.record_id}`}><td className="p-2">{entry.record_category} · {entry.record_id}</td><td className="p-2">{patientName(entry.patient_id)}</td><td className="p-2">{entry.archive_state}</td><td className="p-2">{formatDateTime(entry.recorded_at)}</td><td className="p-2">{entry.state_note}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">No records have been archived or sealed.</p>}
        </Card>
        <Card title="Immutable disposal certificates" subtitle="Certificates preserve the reviewed schedule, independent approvers, execution record, and legal-hold clearance time.">
            {certificates.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Record</th><th className="p-2">Schedule</th><th className="p-2">Retention basis</th><th className="p-2">Approvers</th><th className="p-2">Issued / hold cleared</th><th className="p-2">Fingerprint</th></tr></thead><tbody>{certificates.map((certificate) => <tr className="border-b" key={certificate.id}><td className="p-2">{certificate.record_category} · {certificate.record_id}</td><td className="p-2">v{certificate.schedule_version}</td><td className="p-2">{certificate.retention_basis}</td><td className="p-2">{certificate.first_approved_by}<span className="block">{certificate.second_approved_by}</span></td><td className="p-2">{formatDateTime(certificate.issued_at)}<span className="block text-xs text-slate-500">Hold clear {formatDateTime(certificate.legal_hold_clearance_at)}</span></td><td className="p-2 font-mono text-xs">{certificate.record_fingerprint}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">No disposal certificates have been issued.</p>}
        </Card>
    </section>;
};

export { RetentionManagementPanel };
