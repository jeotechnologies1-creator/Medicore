const incidentReporterRoles = ['super_admin', 'safety_officer', 'doctor', 'nurse', 'pharmacist', 'laboratory_scientist', 'radiographer', 'surgeon', 'specialist', 'records_officer', 'theatre_staff'];

const IncidentSafetyModule = () => {
    const { user } = useAuth();
    const client = window.OneMedSupabase?.getClient?.();
    const facilityId = user?.facility_id || user?.facilityId || '';
    const isSafetyLead = ['super_admin', 'safety_officer'].includes(user?.role);
    const canReport = incidentReporterRoles.includes(user?.role);
    const canManageInfection = ['super_admin', 'safety_officer'].includes(user?.role);
    const [incidents, setIncidents] = useState([]);
    const [severities, setSeverities] = useState([]);
    const [identities, setIdentities] = useState([]);
    const [investigations, setInvestigations] = useState([]);
    const [actions, setActions] = useState([]);
    const [myActions, setMyActions] = useState([]);
    const [closures, setClosures] = useState([]);
    const [cases, setCases] = useState([]);
    const [wards, setWards] = useState([]);
    const [profiles, setProfiles] = useState([]);
    const [trends, setTrends] = useState([]);
    const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
    const [incidentForm, setIncidentForm] = useState({ severity: '', type: '', title: '', description: '', occurred: '', location: '', patient: '' });
    const [investigationDrafts, setInvestigationDrafts] = useState({}); const [actionDrafts, setActionDrafts] = useState({}); const [closureDrafts, setClosureDrafts] = useState({});
    const [infectionForm, setInfectionForm] = useState({ ward: '', patient: '', category: '', classification: '', onset: '', status: 'active' });
    const [trendRange, setTrendRange] = useState({ start: '', end: '' });

    const refresh = useCallback(async () => {
        if (!client || !facilityId) { setError('Incident workflows require an active facility profile.'); return; }
        const requests = [
            client.from('safety_incidents').select('*').eq('facility_id', facilityId).order('reported_at', { ascending: false }),
            client.from('incident_severity_scales').select('*').eq('facility_id', facilityId).eq('active', true).order('rank_order')
        ];
        if (isSafetyLead) requests.push(
            client.from('safety_incident_reporter_identity').select('*'),
            client.from('safety_incident_investigations').select('*').eq('facility_id', facilityId),
            client.from('safety_incident_actions').select('*').eq('facility_id', facilityId).order('due_date'),
            client.from('safety_incident_closures').select('*').eq('facility_id', facilityId),
            client.from('profiles').select('id,full_name,role,facility_id,status').eq('facility_id', facilityId).eq('status', 'active').order('full_name')
        );
        else requests.push(client.from('safety_incident_actions').select('*').eq('facility_id', facilityId).order('due_date'));
        if (canManageInfection) requests.push(
            client.from('infection_surveillance_cases').select('*').eq('facility_id', facilityId).order('onset_date', { ascending: false }),
            client.from('wards').select('id,name,facility_id').eq('facility_id', facilityId).order('name')
        );
        const results = await Promise.all(requests);
        const failed = results.find((item) => item.error);
        if (failed) { setError(failed.error.message || 'Safety records could not be loaded. Check your facility access.'); return; }
        setIncidents(results[0].data || []); setSeverities(results[1].data || []);
        if (isSafetyLead) {
            setIdentities(results[2].data || []); setInvestigations(results[3].data || []); setActions(results[4].data || []); setClosures(results[5].data || []); setProfiles(results[6].data || []);
        } else setMyActions(results[2].data || []);
        if (canManageInfection) { setCases(results[isSafetyLead ? 7 : 3].data || []); setWards(results[isSafetyLead ? 8 : 4].data || []); }
        setError('');
    }, [client, facilityId, isSafetyLead, canManageInfection]);
    useEffect(() => { refresh(); }, [refresh]);

    const run = async (rpc, args, success) => {
        if (!client) { setError('Database connection is unavailable.'); return null; }
        setBusy(true); setError(''); setNotice('');
        const { data, error: rpcError } = await client.rpc(rpc, args);
        setBusy(false);
        if (rpcError) { setError(rpcError.message || 'Safety workflow action failed.'); return null; }
        setNotice(success); await refresh(); return data;
    };
    const report = async (event) => {
        event.preventDefault();
        const result = await run('report_safety_incident', {
            p_facility_id: facilityId, p_severity_key: incidentForm.severity, p_incident_type: incidentForm.type,
            p_title: incidentForm.title, p_description: incidentForm.description,
            p_occurred_at: incidentForm.occurred ? new Date(incidentForm.occurred).toISOString() : null,
            p_location: incidentForm.location, p_patient_id: incidentForm.patient || null
        }, 'Confidential incident report submitted.');
        if (result) setIncidentForm({ severity: '', type: '', title: '', description: '', occurred: '', location: '', patient: '' });
    };
    const submitInfectionCase = async (event) => {
        event.preventDefault();
        const result = await run('record_infection_surveillance_case', {
            p_facility_id: facilityId, p_ward_id: infectionForm.ward, p_patient_id: infectionForm.patient || null,
            p_category: infectionForm.category, p_classification: infectionForm.classification,
            p_onset_date: infectionForm.onset, p_status: infectionForm.status
        }, 'Infection surveillance case recorded.');
        if (result) setInfectionForm({ ward: '', patient: '', category: '', classification: '', onset: '', status: 'active' });
    };
    const loadTrends = async (event) => {
        event.preventDefault(); setError('');
        const { data, error: rpcError } = await client.rpc('get_ward_infection_trends', { p_facility_id: facilityId, p_start_date: trendRange.start, p_end_date: trendRange.end });
        if (rpcError) setError(rpcError.message || 'Ward trends could not be loaded.'); else setTrends(data || []);
    };
    const incidentIdentity = (id) => identities.find((entry) => entry.incident_id === id)?.reporter_profile_id;
    const personName = (id) => profiles.find((person) => person.id === id)?.full_name || id || 'Unknown';
    const investigationFor = (id) => investigations.find((entry) => entry.incident_id === id);
    const closureFor = (id) => closures.find((entry) => entry.incident_id === id);
    const actionsFor = (id) => actions.filter((entry) => entry.incident_id === id);

    return <main className="space-y-6 p-6"><section aria-label="Confidential incident reporting and infection surveillance" className="space-y-6">
        <header><h2 className="text-2xl font-bold text-slate-900">{!canReport && !isSafetyLead ? 'My assigned CAPA actions' : 'Safety incidents & infection surveillance'}</h2><p className="mt-1 text-sm text-slate-600">{!canReport && !isSafetyLead ? 'Review only corrective actions assigned to your profile. Incident details and reporter identities remain restricted.' : 'Facility-scoped confidential reporting, investigation, corrective actions, and ward trends.'}</p></header>
        {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {canReport && <Card title="Submit confidential incident report" subtitle="Only you as the reporter and the facility safety lead can view this report. Reporter identity is stored separately and visible only to the safety lead."><form className="grid gap-3 md:grid-cols-2" onSubmit={report}>
            <label className="text-sm">Severity<select required className="mt-1 w-full rounded border p-2" value={incidentForm.severity} onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}><option value="">Choose facility severity</option>{severities.map((row) => <option key={row.id} value={row.severity_key}>{row.display_label}</option>)}</select></label>
            {severities.length === 0 && <p className="text-sm text-amber-800 md:col-span-2">No incident severity scale is configured for this facility. Ask a safety lead to configure one before submitting reports.</p>}
            <label className="text-sm">Incident type<input required className="mt-1 w-full rounded border p-2" value={incidentForm.type} onChange={(e) => setIncidentForm({ ...incidentForm, type: e.target.value })} /></label>
            <label className="text-sm">Title<input required className="mt-1 w-full rounded border p-2" value={incidentForm.title} onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })} /></label>
            <label className="text-sm">Location<input required className="mt-1 w-full rounded border p-2" value={incidentForm.location} onChange={(e) => setIncidentForm({ ...incidentForm, location: e.target.value })} /></label>
            <label className="text-sm">Occurred at<input required type="datetime-local" className="mt-1 w-full rounded border p-2" value={incidentForm.occurred} onChange={(e) => setIncidentForm({ ...incidentForm, occurred: e.target.value })} /></label>
            <label className="text-sm">Patient ID (optional)<input className="mt-1 w-full rounded border p-2" value={incidentForm.patient} onChange={(e) => setIncidentForm({ ...incidentForm, patient: e.target.value })} placeholder="Patient UUID" /></label>
            <label className="text-sm md:col-span-2">Description<textarea required minLength="10" className="mt-1 w-full rounded border p-2" rows="3" value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })} /></label>
            <Button type="submit" disabled={busy || severities.length === 0}>Submit confidential report</Button>
        </form></Card>}

        {(canReport || isSafetyLead) && <Card title={isSafetyLead ? 'Restricted incident queue' : 'My submitted incident reports'} subtitle={isSafetyLead ? 'Visible to facility safety leads and Super Admins.' : 'Only your own submitted reports are returned by database row security.'}>
            {incidents.length ? <div className="space-y-4">{incidents.map((incident) => {
                const investigation = investigationFor(incident.id); const incidentActions = actionsFor(incident.id); const closed = closureFor(incident.id);
                const identity = user?.role === 'safety_officer' ? incidentIdentity(incident.id) : null;
                return <article key={incident.id} className="rounded-lg border p-4" data-testid="safety-incident-row">
                    <div className="flex flex-wrap items-center justify-between gap-2"><strong>{incident.title}</strong><Badge>{incident.status}</Badge></div>
                    <p className="mt-1 text-sm">{incident.incident_type} · {incident.location} · {formatDateTime(incident.occurred_at)}</p><p className="mt-2 whitespace-pre-wrap text-sm">{incident.description}</p>
                    {isSafetyLead && <p className="mt-2 text-xs text-slate-500">Reporter: {identity ? personName(identity) : 'Identity withheld from this role'}</p>}
                    {isSafetyLead && !closed && <div className="mt-4 space-y-4 border-t pt-3">
                        <form className="grid gap-2 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const draft = investigationDrafts[incident.id] || {}; run('investigate_safety_incident', { p_incident_id: incident.id, p_findings: draft.findings, p_root_cause: draft.cause || null }, 'Investigation record saved.'); }}><label className="text-sm">Investigation findings<textarea required className="mt-1 w-full rounded border p-2" value={investigationDrafts[incident.id]?.findings || investigation?.findings || ''} onChange={(e) => setInvestigationDrafts({ ...investigationDrafts, [incident.id]: { ...investigationDrafts[incident.id], findings: e.target.value } })} /></label><label className="text-sm">Root cause<textarea className="mt-1 w-full rounded border p-2" value={investigationDrafts[incident.id]?.cause || investigation?.root_cause || ''} onChange={(e) => setInvestigationDrafts({ ...investigationDrafts, [incident.id]: { ...investigationDrafts[incident.id], cause: e.target.value } })} /></label><Button type="submit" disabled={busy}>{investigation ? 'Update investigation' : 'Save investigation'}</Button></form>
                        <form className="grid gap-2 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const draft = actionDrafts[incident.id] || {}; run('add_safety_incident_action', { p_incident_id: incident.id, p_type: draft.type, p_description: draft.description, p_owner: draft.owner, p_due_date: draft.due }, 'Corrective or preventive action assigned.'); }}><label className="text-sm">Action type<select className="mt-1 w-full rounded border p-2" value={actionDrafts[incident.id]?.type || 'corrective'} onChange={(e) => setActionDrafts({ ...actionDrafts, [incident.id]: { ...actionDrafts[incident.id], type: e.target.value } })}><option value="corrective">Corrective</option><option value="preventive">Preventive</option></select></label><label className="text-sm">Owner<select required className="mt-1 w-full rounded border p-2" value={actionDrafts[incident.id]?.owner || ''} onChange={(e) => setActionDrafts({ ...actionDrafts, [incident.id]: { ...actionDrafts[incident.id], owner: e.target.value } })}><option value="">Assign owner</option>{profiles.map((person) => <option key={person.id} value={person.id}>{person.full_name} · {person.role}</option>)}</select></label><label className="text-sm md:col-span-2">Action description<input required className="mt-1 w-full rounded border p-2" value={actionDrafts[incident.id]?.description || ''} onChange={(e) => setActionDrafts({ ...actionDrafts, [incident.id]: { ...actionDrafts[incident.id], description: e.target.value } })} /></label><label className="text-sm">Due date<input required type="date" className="mt-1 w-full rounded border p-2" value={actionDrafts[incident.id]?.due || ''} onChange={(e) => setActionDrafts({ ...actionDrafts, [incident.id]: { ...actionDrafts[incident.id], due: e.target.value } })} /></label><Button type="submit" disabled={busy}>Assign CAPA action</Button></form>
                        {incidentActions.map((action) => <div key={action.id} className="rounded bg-slate-50 p-3 text-sm"><strong>{action.action_type}:</strong> {action.description} · owner {personName(action.owner_profile_id)} · due {action.due_date} · {action.status}<div className="mt-2 flex gap-2">{action.owner_profile_id === user?.id && action.status === 'open' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run('update_safety_incident_action', { p_action_id: action.id, p_status: 'in_progress' }, 'Action marked in progress.')}>Start</Button>}{action.owner_profile_id === user?.id && ['open', 'in_progress'].includes(action.status) && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run('update_safety_incident_action', { p_action_id: action.id, p_status: 'completed' }, 'Action marked complete by its owner.')}>Mark complete</Button>}{action.status === 'completed' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run('update_safety_incident_action', { p_action_id: action.id, p_status: 'verified' }, 'Action independently verified.')}>Verify action</Button>}</div></div>)}
                        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); run('close_safety_incident', { p_incident_id: incident.id, p_closure_summary: closureDrafts[incident.id] || '' }, 'Incident closed with recorded sign-off.'); }}><label className="text-sm">Closure summary and sign-off<textarea className="mt-1 w-full rounded border p-2" required value={closureDrafts[incident.id] || ''} onChange={(e) => setClosureDrafts({ ...closureDrafts, [incident.id]: e.target.value })} /></label><Button type="submit" disabled={busy || !investigation || !incidentActions.length || incidentActions.some((action) => action.status !== 'verified')}>Close incident after investigation and CAPA verification</Button></form>
                    </div>}
                    {closed && <p className="mt-3 rounded bg-emerald-50 p-3 text-sm">Closed with signed summary: {closed.closure_summary} · {formatDateTime(closed.signed_at)}</p>}
                </article>;
            })}</div> : <p className="rounded bg-slate-50 p-3 text-sm text-slate-500">{isSafetyLead ? 'No incidents are currently reported for this facility.' : 'You have not submitted an incident report.'}</p>}
        </Card>}

        {!isSafetyLead && <Card title="CAPA actions assigned to me" subtitle="Owners can view and progress only actions assigned to their profile. Incident details and reporter identity remain restricted.">{myActions.length ? <div className="space-y-2">{myActions.map((action) => <article key={action.id} className="rounded border p-3 text-sm"><strong>{action.action_type}</strong> · {action.description}<p>Due {action.due_date} · {action.status} · Incident reference {action.incident_id}</p><div className="mt-2 flex gap-2">{action.status === 'open' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run('update_safety_incident_action', { p_action_id: action.id, p_status: 'in_progress' }, 'Action marked in progress.')}>Start action</Button>}{['open', 'in_progress'].includes(action.status) && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run('update_safety_incident_action', { p_action_id: action.id, p_status: 'completed' }, 'Action marked complete.')}>Mark action complete</Button>}</div></article>)}</div> : <p className="text-sm text-slate-500">No CAPA actions are assigned to you.</p>}</Card>}

        {canManageInfection && <div className="grid gap-5 xl:grid-cols-2"><Card title="Record infection surveillance case" subtitle="Patient-level case data is restricted to surveillance readers; trend output is ward and category aggregate only."><form className="grid gap-3 md:grid-cols-2" onSubmit={submitInfectionCase}><label className="text-sm">Ward<select required className="mt-1 w-full rounded border p-2" value={infectionForm.ward} onChange={(e) => setInfectionForm({ ...infectionForm, ward: e.target.value })}><option value="">Select ward</option>{wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</select></label><label className="text-sm">Patient ID (optional)<input className="mt-1 w-full rounded border p-2" value={infectionForm.patient} onChange={(e) => setInfectionForm({ ...infectionForm, patient: e.target.value })} /></label><label className="text-sm">Case category<input required className="mt-1 w-full rounded border p-2" value={infectionForm.category} onChange={(e) => setInfectionForm({ ...infectionForm, category: e.target.value })} /></label><label className="text-sm">Classification<input required className="mt-1 w-full rounded border p-2" value={infectionForm.classification} onChange={(e) => setInfectionForm({ ...infectionForm, classification: e.target.value })} /></label><label className="text-sm">Onset date<input required type="date" className="mt-1 w-full rounded border p-2" value={infectionForm.onset} onChange={(e) => setInfectionForm({ ...infectionForm, onset: e.target.value })} /></label><label className="text-sm">Status<select className="mt-1 w-full rounded border p-2" value={infectionForm.status} onChange={(e) => setInfectionForm({ ...infectionForm, status: e.target.value })}><option value="active">Active</option><option value="resolved">Resolved</option><option value="ruled_out">Ruled out</option></select></label><Button type="submit" disabled={busy}>Record infection case</Button></form><div className="mt-4 space-y-2">{cases.length ? cases.map((c) => <p className="rounded border p-2 text-sm" key={c.id}>{wards.find((w) => w.id === c.ward_id)?.name || 'Ward'} · {c.case_category} · {c.classification} · {c.onset_date} · {c.status}</p>) : <p className="text-sm text-slate-500">No infection surveillance cases are recorded.</p>}</div></Card>
            <Card title="Ward-level infection trends" subtitle="Aggregated counts from the governed trend RPC; ruled-out cases are excluded."><form className="grid gap-3 md:grid-cols-2" onSubmit={loadTrends}><label className="text-sm">From<input required type="date" className="mt-1 w-full rounded border p-2" value={trendRange.start} onChange={(e) => setTrendRange({ ...trendRange, start: e.target.value })} /></label><label className="text-sm">To<input required type="date" className="mt-1 w-full rounded border p-2" value={trendRange.end} onChange={(e) => setTrendRange({ ...trendRange, end: e.target.value })} /></label><Button type="submit">Load ward trends</Button></form>{trends.length ? <div className="mt-4 space-y-2">{trends.map((row) => <div key={`${row.ward_id}:${row.case_category}`} className="flex justify-between rounded border p-3 text-sm"><span>{row.ward_name} · {row.case_category}</span><strong>{row.case_count}</strong></div>)}</div> : <p className="mt-4 text-sm text-slate-500">Choose a date range to view aggregate ward counts.</p>}</Card></div>}
    </section></main>;
};

export { IncidentSafetyModule };
