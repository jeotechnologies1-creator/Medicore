const releaseScopeOptions = [
    ['demographics', 'Patient demographics'], ['encounters', 'Encounter records'], ['discharge_summaries', 'Discharge summaries'],
    ['medications', 'Medication records'], ['laboratory', 'Laboratory records'], ['radiology', 'Radiology records'], ['billing', 'Billing records']
];

const ReleaseInformationPanel = ({ patients = [] }) => {
    const { user } = useAuth();
    const client = window.OneMedSupabase?.getClient?.();
    const facilityId = user?.facility_id || user?.facilityId || '';
    const [queue, setQueue] = useState([]);
    const [disclosures, setDisclosures] = useState([]);
    const [accessRequests, setAccessRequests] = useState([]);
    const [deadlinePolicies, setDeadlinePolicies] = useState([]);
    const [draft, setDraft] = useState({ patientId: '', requesterName: '', requesterContact: '', relationship: '', purpose: '', scope: [], sensitive: false });
    const [identityDrafts, setIdentityDrafts] = useState({});
    const [redactionDrafts, setRedactionDrafts] = useState({});
    const [releasedScopes, setReleasedScopes] = useState({});
    const [denialDrafts, setDenialDrafts] = useState({});
    const [accessVerification, setAccessVerification] = useState({});
    const [deadlineDraft, setDeadlineDraft] = useState({ requestType: 'access', dueDays: '', basis: '' });
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        if (!client) { setError('Database connection is unavailable.'); setLoading(false); return; }
        setLoading(true);
        const [releaseResult, disclosureResult, accessResult, policyResult] = await Promise.all([
            client.from('release_information_requests').select('*').eq('facility_id', facilityId).order('received_at', { ascending: false }),
            client.from('disclosure_register').select('id,patient_id,disclosed_to,purpose,data_categories,authority,disclosed_at,requester_relationship,released_scope,redaction_notes,release_request_id').order('disclosed_at', { ascending: false }).limit(100),
            client.rpc('list_data_subject_request_queue'),
            client.from('data_subject_deadline_policies').select('id,facility_id,request_type,due_days,deadline_basis,active').eq('facility_id', facilityId).eq('active', true)
        ]);
        const failed = [releaseResult, disclosureResult, accessResult, policyResult].find((result) => result.error);
        if (failed) setError('Privacy workflow data could not be loaded. Check Records Officer and facility access.');
        else {
            setQueue(releaseResult.data || []); setDisclosures(disclosureResult.data || []);
            setAccessRequests(accessResult.data || []); setDeadlinePolicies(policyResult.data || []); setError('');
        }
        setLoading(false);
    }, [client, facilityId]);

    useEffect(() => { refresh(); }, [refresh]);
    const runRpc = async (name, args, success) => {
        if (!client) return setError('Database connection is unavailable.');
        setBusy(true); setError(''); setMessage('');
        const { error: rpcError } = await client.rpc(name, args);
        setBusy(false);
        if (rpcError) setError(rpcError.message || 'The privacy workflow could not be saved.');
        else { setMessage(success); await refresh(); }
    };
    const toggle = (list, value, setter) => setter((current) => ({ ...current, [list]: current[list]?.includes(value) ? current[list].filter((item) => item !== value) : [...(current[list] || []), value] }));
    const intake = async (event) => {
        event.preventDefault();
        if (!draft.scope.length) return setError('Select at least one requested record scope.');
        await runRpc('intake_release_information_request', {
            p_patient_id: draft.patientId, p_requester_name: draft.requesterName, p_requester_contact: draft.requesterContact || null,
            p_relationship: draft.relationship, p_purpose: draft.purpose, p_scope: draft.scope, p_sensitive: draft.sensitive
        }, 'Release request received and queued for identity and authority verification.');
        setDraft({ patientId: '', requesterName: '', requesterContact: '', relationship: '', purpose: '', scope: [], sensitive: false });
    };
    const verify = (request) => {
        const fields = identityDrafts[request.id] || {};
        if (!fields.method?.trim() || !fields.basis?.trim()) return setError('Record the identity verification method and authorization basis before continuing.');
        runRpc('verify_release_information_request', { p_request_id: request.id, p_identity_method: fields.method, p_identity_notes: fields.notes || null, p_authorization_basis: fields.basis }, 'Requester identity and release authority verified.');
    };
    const approve = (request, second = false) => runRpc('approve_release_information_request', {
        p_request_id: request.id, p_redaction_notes: redactionDrafts[request.id] || null, p_second_review: second
    }, second ? 'Independent second review recorded.' : 'Release request approved.');
    const deny = (request) => {
        const reason = denialDrafts[request.id]?.trim();
        if (!reason) return setError('Enter a reason before denying a release request.');
        runRpc('deny_release_information_request', { p_request_id: request.id, p_reason: reason }, 'Release request denied and recorded.');
    };
    const release = (request) => {
        const scope = releasedScopes[request.id] || request.requested_scope;
        if (!scope.length) return setError('Select at least one record category to release.');
        runRpc('release_information_request', { p_request_id: request.id, p_released_scope: scope, p_redaction_notes: redactionDrafts[request.id] || null }, 'Release recorded in the disclosure register.');
    };
    const configureDeadline = (event) => {
        event.preventDefault();
        runRpc('configure_data_subject_deadline', {
            p_facility_id: facilityId || null, p_request_type: deadlineDraft.requestType,
            p_due_days: deadlineDraft.dueDays === '' ? null : Number(deadlineDraft.dueDays), p_deadline_basis: deadlineDraft.basis
        }, 'Deadline policy saved. Requests without a configured duration will show no due date.');
    };
    const verifyAccessRequest = (request) => {
        const fields = accessVerification[request.id] || {};
        if (!fields.method?.trim() || !fields.basis?.trim()) return setError('Identity method and authorization basis are required.');
        runRpc('verify_data_subject_request', { p_request_id: request.id, p_identity_method: fields.method, p_authorization_basis: fields.basis }, 'Patient access request identity and authority verified.');
    };
    const patientName = (patientId) => {
        const patient = patients.find((item) => item.id === patientId);
        return patient ? `${patient.firstName || patient.first_name || ''} ${patient.lastName || patient.last_name || ''}`.trim() || patientId : patientId;
    };
    return <section className="space-y-6" aria-label="Release of information and privacy requests">
        <div><h2 className="text-xl font-bold text-slate-900">Release of information and privacy requests</h2><p className="mt-1 text-sm text-slate-600">Verify requester identity and authority, obtain independent approvals, and record each completed disclosure.</p></div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={refresh}>Refresh privacy queues</Button></div>
        <Card title="Intake a release request" subtitle="Record the requester, relationship, purpose, and minimum record scope needed.">
            <form className="grid gap-3 md:grid-cols-2" onSubmit={intake}>
                <label className="text-sm">Patient<select required className="mt-1 w-full rounded-lg border p-2" value={draft.patientId} onChange={(event) => setDraft((value) => ({ ...value, patientId: event.target.value }))}><option value="">Select patient</option>{patients.map((patient) => <option value={patient.id} key={patient.id}>{`${patient.firstName || patient.first_name || ''} ${patient.lastName || patient.last_name || ''}`.trim() || patient.patientNumber || patient.patient_number || patient.id}</option>)}</select></label>
                <label className="text-sm">Requester name<input required className="mt-1 w-full rounded border p-2" value={draft.requesterName} onChange={(event) => setDraft((value) => ({ ...value, requesterName: event.target.value }))} /></label>
                <label className="text-sm">Requester relationship to patient<input required className="mt-1 w-full rounded border p-2" value={draft.relationship} onChange={(event) => setDraft((value) => ({ ...value, relationship: event.target.value }))} /></label>
                <label className="text-sm">Requester contact<input className="mt-1 w-full rounded border p-2" value={draft.requesterContact} onChange={(event) => setDraft((value) => ({ ...value, requesterContact: event.target.value }))} /></label>
                <label className="text-sm md:col-span-2">Purpose<textarea required rows="2" className="mt-1 w-full rounded border p-2" value={draft.purpose} onChange={(event) => setDraft((value) => ({ ...value, purpose: event.target.value }))} /></label>
                <fieldset className="rounded-lg border p-3 md:col-span-2"><legend className="px-1 text-sm font-medium">Requested record scope</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{releaseScopeOptions.map(([value, label]) => <label className="flex items-center gap-2 text-sm" key={value}><input type="checkbox" checked={draft.scope.includes(value)} onChange={() => setDraft((current) => ({ ...current, scope: current.scope.includes(value) ? current.scope.filter((item) => item !== value) : [...current.scope, value] }))} />{label}</label>)}</div></fieldset>
                <label className="flex items-start gap-2 text-sm md:col-span-2"><input type="checkbox" className="mt-1" checked={draft.sensitive} onChange={(event) => setDraft((value) => ({ ...value, sensitive: event.target.checked }))} /><span><strong>Sensitive scope</strong><span className="block text-xs text-slate-500">Requires two different authorized approvers before release.</span></span></label>
                <div><Button type="submit" onClick={() => {}} disabled={busy}>Receive request</Button></div>
            </form>
        </Card>
        <Card title="Release request queue" subtitle="Every completed release is written to the disclosure register through the release workflow RPC.">
            {loading ? <p className="text-sm text-slate-500">Loading release requests…</p> : !queue.length ? <p className="rounded bg-slate-50 p-4 text-sm text-slate-600">No release requests are waiting in this facility.</p> : <div className="space-y-3">{queue.map((request) => {
                const requesterIsActor = request.received_by === user?.id;
                const primaryApproval = request.status === 'verified';
                const secondApproval = request.status === 'approved' && request.sensitive_scope && !request.second_reviewed_by;
                const approvalConflict = requesterIsActor || (primaryApproval && request.sensitive_scope && request.identity_verified_by === user?.id) || (secondApproval && request.approved_by === user?.id);
                return <article key={request.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-slate-900">{patientName(request.patient_id)} · {request.requester_name}</h3><p className="mt-1 text-sm text-slate-600">{request.requester_relationship} · {request.purpose}</p><p className="mt-1 text-xs text-slate-500">Received {formatDateTime(request.received_at)} · {request.status.replaceAll('_', ' ')}{request.sensitive_scope ? ' · sensitive scope' : ''}</p><p className="mt-1 text-xs text-slate-500">Requested: {(request.requested_scope || []).join(', ')}</p></div><Badge variant={request.status === 'released' ? 'success' : request.status === 'denied' ? 'danger' : 'warning'}>{request.status.replaceAll('_', ' ')}</Badge></div>
                    {request.status === 'received' && <div className="mt-4 grid gap-2 md:grid-cols-2"><label className="text-sm">Identity verification method<input className="mt-1 w-full rounded border p-2" value={identityDrafts[request.id]?.method || ''} onChange={(event) => setIdentityDrafts((current) => ({ ...current, [request.id]: { ...current[request.id], method: event.target.value } }))} /></label><label className="text-sm">Authorization basis<input className="mt-1 w-full rounded border p-2" value={identityDrafts[request.id]?.basis || ''} onChange={(event) => setIdentityDrafts((current) => ({ ...current, [request.id]: { ...current[request.id], basis: event.target.value } }))} /></label><label className="text-sm md:col-span-2">Identity verification notes<textarea rows="2" className="mt-1 w-full rounded border p-2" value={identityDrafts[request.id]?.notes || ''} onChange={(event) => setIdentityDrafts((current) => ({ ...current, [request.id]: { ...current[request.id], notes: event.target.value } }))} /></label><Button onClick={() => verify(request)} disabled={busy}>Verify identity and authority</Button></div>}
                    {['verified', 'approved'].includes(request.status) && <div className="mt-4 space-y-3"><label className="block text-sm">Redaction notes<textarea rows="2" className="mt-1 w-full rounded border p-2" value={redactionDrafts[request.id] ?? request.redaction_notes ?? ''} onChange={(event) => setRedactionDrafts((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Record excluded or redacted content" /></label>
                        {primaryApproval && <div><Button onClick={() => approve(request)} disabled={busy || approvalConflict}>Approve release</Button>{approvalConflict && <p className="mt-1 text-xs text-amber-700">The staff member who received this request cannot approve it{request.sensitive_scope && request.identity_verified_by === user?.id ? ' or approve a sensitive release they verified' : ''}.</p>}</div>}
                        {secondApproval && <div><Button onClick={() => approve(request, true)} disabled={busy || approvalConflict}>Second approval</Button>{approvalConflict && <p className="mt-1 text-xs text-amber-700">A second approver must differ from the intake staff member and first approver.</p>}</div>}
                        {(primaryApproval || secondApproval || request.status === 'approved') && <div className="rounded-lg bg-slate-50 p-3"><p className="mb-2 text-sm font-medium">Scope to release</p><div className="grid gap-2 sm:grid-cols-2">{request.requested_scope.map((scope) => <label key={scope} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(releasedScopes[request.id] || request.requested_scope).includes(scope)} onChange={() => toggle(request.id, scope, setReleasedScopes)} />{scope.replaceAll('_', ' ')}</label>)}</div><Button className="mt-3" onClick={() => release(request)} disabled={busy || request.status !== 'approved' || (request.sensitive_scope && !request.second_reviewed_by)}>Record release and disclosure</Button>{request.status !== 'approved' && <p className="mt-1 text-xs text-slate-500">Release becomes available after the required approval step{request.sensitive_scope ? 's' : ''}.</p>}</div>}</div>}
                    {['received', 'verified', 'approved'].includes(request.status) && <div className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-64 flex-1 text-sm">Denial reason<input className="mt-1 w-full rounded border p-2" value={denialDrafts[request.id] || ''} onChange={(event) => setDenialDrafts((current) => ({ ...current, [request.id]: event.target.value }))} /></label><Button variant="ghost" onClick={() => deny(request)} disabled={busy}>Deny request</Button></div>}
                    {request.denial_reason && <p className="mt-2 text-sm text-red-700">Denial reason: {request.denial_reason}</p>}
                </article>;
            })}</div>}
        </Card>
        <Card title="Disclosure register" subtitle="Recorded disclosures are immutable audit entries; only releases completed through the approved workflow appear here.">
            {disclosures.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Patient</th><th className="p-2">Disclosed to</th><th className="p-2">Scope</th><th className="p-2">Purpose / authority</th><th className="p-2">Date</th><th className="p-2">Redactions</th></tr></thead><tbody>{disclosures.map((entry) => <tr key={entry.id} className="border-b"><td className="p-2">{patientName(entry.patient_id)}</td><td className="p-2">{entry.disclosed_to}<span className="block text-xs text-slate-500">{entry.requester_relationship}</span></td><td className="p-2">{(entry.released_scope || entry.data_categories || []).join(', ')}</td><td className="p-2">{entry.purpose}<span className="block text-xs text-slate-500">{entry.authority}</span></td><td className="p-2">{formatDateTime(entry.disclosed_at)}</td><td className="p-2">{entry.redaction_notes || '—'}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">No disclosures have been recorded for this facility.</p>}
        </Card>
        <Card title="Patient access-request tracking" subtitle="Due dates and their basis come from configured policy. No statutory period is assumed by this screen.">
            <form className="mb-4 grid gap-2 rounded-lg border p-3 md:grid-cols-4" onSubmit={configureDeadline}><label className="text-sm">Request type<select className="mt-1 w-full rounded border p-2" value={deadlineDraft.requestType} onChange={(event) => setDeadlineDraft((value) => ({ ...value, requestType: event.target.value }))}><option value="access">Access</option><option value="correction">Correction</option><option value="restriction">Restriction</option></select></label><label className="text-sm">Configured due days<input type="number" min="1" className="mt-1 w-full rounded border p-2" value={deadlineDraft.dueDays} onChange={(event) => setDeadlineDraft((value) => ({ ...value, dueDays: event.target.value }))} placeholder="Leave blank for no due date" /></label><label className="text-sm md:col-span-2">Deadline basis<input required className="mt-1 w-full rounded border p-2" value={deadlineDraft.basis} onChange={(event) => setDeadlineDraft((value) => ({ ...value, basis: event.target.value }))} placeholder="Documented policy or legal review basis" /></label><div className="md:col-span-4"><Button type="submit" onClick={() => {}} disabled={busy}>Save deadline policy</Button></div></form>
            <div className="mb-4 space-y-1 text-xs text-slate-500">{deadlinePolicies.map((policy) => <p key={policy.id}>{policy.request_type}: {policy.due_days == null ? 'no due date configured' : `${policy.due_days} configured days`} · {policy.deadline_basis}</p>)}</div>
            {accessRequests.length ? <div className="space-y-2">{accessRequests.map((request) => <article key={request.id} className="rounded border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p><strong>{request.request_type}</strong> · {request.description}</p><Badge>{request.status.replaceAll('_', ' ')}</Badge></div><p className="mt-1 text-xs text-slate-500">{request.patient_id ? patientName(request.patient_id) : 'Patient not linked'} · {request.due_at ? `Due ${formatDateTime(request.due_at)}` : 'No due date configured'} · {request.due_date_basis || 'No deadline basis recorded'}</p>
                {['received', 'identity_review'].includes(request.status) && <div className="mt-2 grid gap-2 md:grid-cols-3"><label className="text-xs">Identity method<input className="mt-1 w-full rounded border p-2 text-sm" value={accessVerification[request.id]?.method || ''} onChange={(event) => setAccessVerification((current) => ({ ...current, [request.id]: { ...current[request.id], method: event.target.value } }))} /></label><label className="text-xs">Authorization basis<input className="mt-1 w-full rounded border p-2 text-sm" value={accessVerification[request.id]?.basis || ''} onChange={(event) => setAccessVerification((current) => ({ ...current, [request.id]: { ...current[request.id], basis: event.target.value } }))} /></label><div className="flex items-end"><Button size="sm" onClick={() => verifyAccessRequest(request)} disabled={busy}>Verify patient request</Button></div></div>}
            </article>)}</div> : <p className="text-sm text-slate-500">No open patient access, correction, or restriction requests are in this authorized queue.</p>}
        </Card>
        {loading && <p className="sr-only" role="status">Loading privacy records…</p>}
    </section>;
};

export { ReleaseInformationPanel };
