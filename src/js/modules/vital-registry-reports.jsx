const VitalRegistryReportsPanel = ({ patients = [] }) => {
    const { user } = useAuth();
    const client = window.OneMedSupabase?.getClient?.();
    const facilityId = user?.facility_id || user?.facilityId || '';
    const canManageReports = ['super_admin', 'records_officer'].includes(user?.role);
    const canManageRegistry = ['super_admin', 'records_officer', 'doctor'].includes(user?.role);
    const [births, setBirths] = useState([]);
    const [deaths, setDeaths] = useState([]);
    const [definitions, setDefinitions] = useState([]);
    const [suppression, setSuppression] = useState(null);
    const [exports, setExports] = useState([]);
    const [birthForm, setBirthForm] = useState({ child: '', mother: '', motherEncounter: '', maternityEvent: '', sourceSystem: 'manual', occurredAt: '', outcome: 'live_birth', plurality: '1', birthOrder: '', sex: '', reference: '' });
    const [deathForm, setDeathForm] = useState({ patient: '', encounter: '', sourceEvent: '', sourceSystem: 'manual', occurredAt: '', reference: '' });
    const [verification, setVerification] = useState({});
    const [definitionForm, setDefinitionForm] = useState({ key: '', name: '', births: false, deaths: false, officialMapping: false, formReference: '' });
    const [cellRule, setCellRule] = useState({ minimum: '', basis: '' });
    const [reportForm, setReportForm] = useState({ definition: '', start: '', end: '', recipient: '', purpose: '' });
    const [reportResult, setReportResult] = useState(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        if (!client || !facilityId) { setLoading(false); setError('Vital registry requires an active facility connection.'); return; }
        setLoading(true);
        const registryQueries = [
            client.from('birth_registrations').select('*').eq('facility_id', facilityId).order('occurred_at', { ascending: false }),
            client.from('death_registrations').select('*').eq('facility_id', facilityId).order('occurred_at', { ascending: false })
        ];
        const reportQueries = canManageReports ? [
            client.from('statutory_report_definitions').select('*').eq('facility_id', facilityId).order('report_key').order('version', { ascending: false }),
            client.from('statutory_report_suppression_rules').select('*').eq('facility_id', facilityId).maybeSingle(),
            client.from('statutory_report_exports').select('*').eq('facility_id', facilityId).order('exported_at', { ascending: false }).limit(50)
        ] : [];
        const results = await Promise.all([...registryQueries, ...reportQueries]);
        const failed = results.find((result) => result.error);
        if (failed) setError('Vital registry records could not be loaded. Check role and facility permissions.');
        else {
            setBirths(results[0].data || []); setDeaths(results[1].data || []);
            if (canManageReports) {
                setDefinitions(results[2].data || []); setSuppression(results[3].data || null); setExports(results[4].data || []);
                if (!reportForm.definition && results[2].data?.length) setReportForm((current) => ({ ...current, definition: results[2].data.find((row) => row.active)?.id || results[2].data[0].id }));
            }
            setError('');
        }
        setLoading(false);
    }, [client, facilityId, canManageReports, reportForm.definition]);

    useEffect(() => { refresh(); }, [refresh]);

    const call = async (name, args, success, refreshAfter = true) => {
        if (!client) return setError('Database connection is unavailable.');
        setBusy(true); setError(''); setMessage('');
        const { data, error: rpcError } = await client.rpc(name, args);
        setBusy(false);
        if (rpcError) setError(rpcError.message || 'The vital registry action could not be saved.');
        else { setMessage(success); if (refreshAfter) await refresh(); return data; }
        return null;
    };

    const submitBirth = async (event) => {
        event.preventDefault();
        if (!birthForm.child && !birthForm.mother && !birthForm.motherEncounter && !birthForm.maternityEvent) return setError('Link a child, mother, maternity encounter, or source event before registering the birth.');
        const result = await call('register_birth', {
            p_facility_id: facilityId, p_child_patient_id: birthForm.child || null, p_mother_patient_id: birthForm.mother || null,
            p_mother_encounter_id: birthForm.motherEncounter || null, p_maternity_source_event_id: birthForm.maternityEvent || null,
            p_source_system: birthForm.sourceSystem, p_occurred_at: birthForm.occurredAt ? new Date(birthForm.occurredAt).toISOString() : null,
            p_birth_outcome: birthForm.outcome, p_plurality: Number(birthForm.plurality), p_birth_order: birthForm.birthOrder ? Number(birthForm.birthOrder) : null,
            p_sex_recorded: birthForm.sex || null, p_source_reference: birthForm.reference || null
        }, 'Birth registration entered and awaits source verification.');
        if (result) setBirthForm((current) => ({ ...current, occurredAt: '', birthOrder: '', reference: '' }));
    };
    const submitDeath = async (event) => {
        event.preventDefault();
        if (!deathForm.patient && !deathForm.encounter && !deathForm.sourceEvent) return setError('Link a patient, emergency encounter, or source event before registering the death.');
        const result = await call('register_death', {
            p_facility_id: facilityId, p_patient_id: deathForm.patient || null, p_encounter_id: deathForm.encounter || null,
            p_source_system: deathForm.sourceSystem, p_source_event_id: deathForm.sourceEvent || null,
            p_occurred_at: deathForm.occurredAt ? new Date(deathForm.occurredAt).toISOString() : null, p_source_reference: deathForm.reference || null
        }, 'Death registration entered and awaits source verification.');
        if (result) setDeathForm((current) => ({ ...current, occurredAt: '', reference: '' }));
    };
    const verify = (type, id) => {
        const fields = verification[`${type}:${id}`] || {};
        if (!fields.method?.trim()) return setError('Enter the source verification method before verification.');
        call('verify_vital_registration', { p_record_type: type, p_record_id: id, p_method: fields.method, p_notes: fields.notes || null }, 'Vital event source verified.');
    };
    const defineReport = (event) => {
        event.preventDefault();
        const measures = [definitionForm.births && 'verified_birth_count', definitionForm.deaths && 'verified_death_count'].filter(Boolean);
        if (!measures.length) return setError('Select at least one supported aggregate measure.');
        if (definitionForm.officialMapping && !definitionForm.formReference.trim()) return setError('Provide the facility-supplied official form reference before marking a mapping as validated.');
        const definition = { measures, dimensions: [], mapping_status: definitionForm.officialMapping ? 'facility_validated' : 'illustrative_or_unmapped' };
        if (definitionForm.formReference.trim()) definition.official_form_reference = definitionForm.formReference.trim();
        call('configure_statutory_report', {
            p_facility_id: facilityId, p_report_key: definitionForm.key, p_report_name: definitionForm.name,
            p_definition: definition, p_official_mapping: definitionForm.officialMapping
        }, 'A new versioned report definition was saved.');
    };
    const saveCellRule = (event) => {
        event.preventDefault();
        const minimum = cellRule.minimum === '' ? null : Number(cellRule.minimum);
        if (minimum !== null && minimum < 2) return setError('Small-cell suppression threshold must be at least two.');
        call('configure_statutory_small_cell_rule', { p_facility_id: facilityId, p_minimum_cell_count: minimum, p_policy_basis: cellRule.basis || null }, minimum === null ? 'Small-cell suppression rule cleared.' : 'Small-cell suppression rule saved.');
    };
    const runReport = async (event) => {
        event.preventDefault();
        if (!reportForm.definition || !reportForm.start || !reportForm.end) return setError('Choose an active report definition and complete reporting period.');
        setBusy(true); setError(''); setMessage('');
        const { data, error: rpcError } = await client.rpc('aggregate_statutory_report', { p_definition_id: reportForm.definition, p_period_start: reportForm.start, p_period_end: reportForm.end });
        setBusy(false);
        if (rpcError) setError(rpcError.message || 'Report could not be generated.'); else setReportResult(data);
    };
    const exportReport = async () => {
        if (!reportForm.definition || !reportForm.start || !reportForm.end || !reportForm.recipient.trim() || !reportForm.purpose.trim()) return setError('Generate the report and enter export recipient and purpose before exporting.');
        const exportId = await call('export_statutory_report', {
            p_definition_id: reportForm.definition, p_period_start: reportForm.start, p_period_end: reportForm.end,
            p_recipient: reportForm.recipient, p_purpose: reportForm.purpose
        }, 'Report export completed and recorded in the audited statutory export disclosure log.');
        if (exportId) await refresh();
    };
    const patientLabel = (id) => {
        const patient = patients.find((row) => row.id === id);
        return patient ? `${patient.firstName || patient.first_name || ''} ${patient.lastName || patient.last_name || ''}`.trim() || id : id || 'Not linked';
    };
    const verifierFields = (type, id) => verification[`${type}:${id}`] || {};
    const setVerifier = (key, field, value) => setVerification((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));

    return <section className="space-y-6" aria-label="Birth, death, and statutory reporting">
        <div><h2 className="text-xl font-bold text-slate-900">Birth, death, and statutory reporting</h2><p className="mt-1 text-sm text-slate-600">Record vital events with source evidence and generate facility-scoped aggregate reports from configured definitions.</p></div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={refresh}>Refresh vital registry</Button></div>
        {canManageRegistry && <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Register birth" subtitle="Link the mother, child, maternity encounter, or source event when available. Registration remains pending until source verification.">
                <form className="grid gap-3 md:grid-cols-2" onSubmit={submitBirth}>
                    <label className="text-sm">Child patient{patients.length ? <select className="mt-1 w-full rounded border p-2" value={birthForm.child} onChange={(event) => setBirthForm((value) => ({ ...value, child: event.target.value }))}><option value="">Not linked</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patientLabel(patient.id)}</option>)}</select> : <input className="mt-1 w-full rounded border p-2" value={birthForm.child} onChange={(event) => setBirthForm((value) => ({ ...value, child: event.target.value }))} placeholder="Patient UUID (optional)" />}</label>
                    <label className="text-sm">Mother patient{patients.length ? <select className="mt-1 w-full rounded border p-2" value={birthForm.mother} onChange={(event) => setBirthForm((value) => ({ ...value, mother: event.target.value }))}><option value="">Not linked</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patientLabel(patient.id)}</option>)}</select> : <input className="mt-1 w-full rounded border p-2" value={birthForm.mother} onChange={(event) => setBirthForm((value) => ({ ...value, mother: event.target.value }))} placeholder="Patient UUID (optional)" />}</label>
                    <label className="text-sm">Mother encounter ID<input className="mt-1 w-full rounded border p-2" value={birthForm.motherEncounter} onChange={(event) => setBirthForm((value) => ({ ...value, motherEncounter: event.target.value }))} placeholder="Encounter UUID" /></label>
                    <label className="text-sm">Maternity source event ID<input className="mt-1 w-full rounded border p-2" value={birthForm.maternityEvent} onChange={(event) => setBirthForm((value) => ({ ...value, maternityEvent: event.target.value }))} placeholder="Source event UUID, when available" /></label>
                    <label className="text-sm">Source system<input required className="mt-1 w-full rounded border p-2" value={birthForm.sourceSystem} onChange={(event) => setBirthForm((value) => ({ ...value, sourceSystem: event.target.value }))} /></label>
                    <label className="text-sm">Birth date and time<input required type="datetime-local" className="mt-1 w-full rounded border p-2" value={birthForm.occurredAt} onChange={(event) => setBirthForm((value) => ({ ...value, occurredAt: event.target.value }))} /></label>
                    <label className="text-sm">Outcome<select className="mt-1 w-full rounded border p-2" value={birthForm.outcome} onChange={(event) => setBirthForm((value) => ({ ...value, outcome: event.target.value }))}><option value="live_birth">Live birth</option><option value="stillbirth">Stillbirth</option></select></label>
                    <label className="text-sm">Plurality<input required type="number" min="1" className="mt-1 w-full rounded border p-2" value={birthForm.plurality} onChange={(event) => setBirthForm((value) => ({ ...value, plurality: event.target.value }))} /></label>
                    <label className="text-sm">Birth order<input type="number" min="1" className="mt-1 w-full rounded border p-2" value={birthForm.birthOrder} onChange={(event) => setBirthForm((value) => ({ ...value, birthOrder: event.target.value }))} /></label>
                    <label className="text-sm">Sex recorded<select className="mt-1 w-full rounded border p-2" value={birthForm.sex} onChange={(event) => setBirthForm((value) => ({ ...value, sex: event.target.value }))}><option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="undetermined">Undetermined</option><option value="not_recorded">Not recorded</option></select></label>
                    <label className="text-sm md:col-span-2">Source reference<input className="mt-1 w-full rounded border p-2" value={birthForm.reference} onChange={(event) => setBirthForm((value) => ({ ...value, reference: event.target.value }))} /></label>
                    <div className="md:col-span-2"><Button type="submit" disabled={busy}>Register birth</Button></div>
                </form>
                <p className="mt-3 rounded bg-amber-50 p-3 text-xs text-amber-900">No maternity event table is present in this migration chain. Link a mother encounter or provide the upstream maternity source event UUID; no maternity record is fabricated here.</p>
            </Card>
            <Card title="Register death" subtitle="Emergency encounters are linked by ID and validated by the database against the clinician-confirmed BID assessment.">
                <form className="grid gap-3 md:grid-cols-2" onSubmit={submitDeath}>
                    <label className="text-sm">Patient{patients.length ? <select className="mt-1 w-full rounded border p-2" value={deathForm.patient} onChange={(event) => setDeathForm((value) => ({ ...value, patient: event.target.value }))}><option value="">Not linked</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patientLabel(patient.id)}</option>)}</select> : <input className="mt-1 w-full rounded border p-2" value={deathForm.patient} onChange={(event) => setDeathForm((value) => ({ ...value, patient: event.target.value }))} placeholder="Patient UUID (optional)" />}</label>
                    <label className="text-sm">Confirmed emergency encounter ID<input className="mt-1 w-full rounded border p-2" value={deathForm.encounter} onChange={(event) => setDeathForm((value) => ({ ...value, encounter: event.target.value }))} placeholder="BID encounter UUID" /></label>
                    <label className="text-sm">Source event ID<input className="mt-1 w-full rounded border p-2" value={deathForm.sourceEvent} onChange={(event) => setDeathForm((value) => ({ ...value, sourceEvent: event.target.value }))} placeholder="Optional upstream UUID" /></label>
                    <label className="text-sm">Source system<input required className="mt-1 w-full rounded border p-2" value={deathForm.sourceSystem} onChange={(event) => setDeathForm((value) => ({ ...value, sourceSystem: event.target.value }))} /></label>
                    <label className="text-sm">Date and time of death<input required type="datetime-local" className="mt-1 w-full rounded border p-2" value={deathForm.occurredAt} onChange={(event) => setDeathForm((value) => ({ ...value, occurredAt: event.target.value }))} /></label>
                    <label className="text-sm md:col-span-2">Source reference<input className="mt-1 w-full rounded border p-2" value={deathForm.reference} onChange={(event) => setDeathForm((value) => ({ ...value, reference: event.target.value }))} /></label>
                    <div className="md:col-span-2"><Button type="submit" disabled={busy}>Register death</Button></div>
                </form>
                <p className="mt-3 rounded bg-slate-50 p-3 text-xs text-slate-600">A death linked to an emergency encounter is accepted only when that encounter is a BID case with a clinician-confirmed death assessment.</p>
            </Card>
        </div>}
        <Card title="Birth and death source verification" subtitle="Record the verification method before marking a vital event as verified.">
            {loading ? <p className="text-sm text-slate-500">Loading vital registrations…</p> : <div className="grid gap-5 xl:grid-cols-2">
                <div><h3 className="mb-2 font-semibold">Birth registrations</h3>{births.length ? births.map((row) => <article key={row.id} className="mb-3 rounded-lg border p-3"><div className="flex justify-between gap-2"><strong>{row.birth_outcome.replaceAll('_', ' ')} · {formatDateTime(row.occurred_at)}</strong><Badge>{row.verification_status}</Badge></div><p className="text-sm">Mother: {patientLabel(row.mother_patient_id)} · Child: {patientLabel(row.child_patient_id)}</p><p className="text-xs text-slate-500">{row.source_system} · {row.source_reference || row.maternity_source_event_id || row.mother_encounter_id || 'No source reference'}</p>{row.verification_status === 'pending' && <div className="mt-2 grid gap-2 md:grid-cols-2"><label className="text-sm">Source verification method<input className="mt-1 w-full rounded border p-2" value={verifierFields('birth', row.id).method || ''} onChange={(event) => setVerifier(`birth:${row.id}`, 'method', event.target.value)} /></label><label className="text-sm">Verification notes<input className="mt-1 w-full rounded border p-2" value={verifierFields('birth', row.id).notes || ''} onChange={(event) => setVerifier(`birth:${row.id}`, 'notes', event.target.value)} /></label><Button className="md:col-span-2" onClick={() => verify('birth', row.id)} disabled={busy}>Verify birth source</Button></div>}</article>) : <p className="rounded bg-slate-50 p-3 text-sm text-slate-500">No birth registrations in this facility.</p>}</div>
                <div><h3 className="mb-2 font-semibold">Death registrations</h3>{deaths.length ? deaths.map((row) => <article key={row.id} className="mb-3 rounded-lg border p-3"><div className="flex justify-between gap-2"><strong>{formatDateTime(row.occurred_at)}</strong><Badge>{row.verification_status}</Badge></div><p className="text-sm">Patient: {patientLabel(row.patient_id)} · Encounter: {row.encounter_id || '—'}</p><p className="text-xs text-slate-500">{row.source_system} · {row.source_reference || row.source_event_id || 'No source reference'}</p>{row.verification_status === 'pending' && <div className="mt-2 grid gap-2 md:grid-cols-2"><label className="text-sm">Source verification method<input className="mt-1 w-full rounded border p-2" value={verifierFields('death', row.id).method || ''} onChange={(event) => setVerifier(`death:${row.id}`, 'method', event.target.value)} /></label><label className="text-sm">Verification notes<input className="mt-1 w-full rounded border p-2" value={verifierFields('death', row.id).notes || ''} onChange={(event) => setVerifier(`death:${row.id}`, 'notes', event.target.value)} /></label><Button className="md:col-span-2" onClick={() => verify('death', row.id)} disabled={busy}>Verify death source</Button></div>}</article>) : <p className="rounded bg-slate-50 p-3 text-sm text-slate-500">No death registrations in this facility.</p>}</div>
            </div>}
        </Card>
        {canManageReports && <>
            <Card title="Statutory report definition management" subtitle="Definitions contain supported aggregate measures only. No NHMIS form layout or indicator mapping is embedded in the application.">
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Forms the facility must supply before official mapping:</strong><ul className="mt-2 list-disc space-y-1 pl-5"><li>Current NPC birth registration form or approved VitalReg birth field specification.</li><li>Current NPC death registration / death notification form or approved VitalReg death field specification.</li><li>The facility’s adopted NHMIS Monthly Summary Form version, including its pregnancy outcomes and mortality definitions.</li><li>Applicable state or federal reporting template and the DHIS2 dataset, indicator dictionary, and validation rules used by the facility.</li></ul><p className="mt-2 text-xs">Confirm the current versions with the facility HMIS focal person. The sample definition remains illustrative until these source materials are supplied and reviewed.</p></div>
                <form className="grid gap-3 md:grid-cols-2" onSubmit={defineReport}>
                    <label className="text-sm">Report key<input required pattern="[a-z0-9][a-z0-9_.-]{1,79}" className="mt-1 w-full rounded border p-2" value={definitionForm.key} onChange={(event) => setDefinitionForm((value) => ({ ...value, key: event.target.value }))} /></label>
                    <label className="text-sm">Report name<input required className="mt-1 w-full rounded border p-2" value={definitionForm.name} onChange={(event) => setDefinitionForm((value) => ({ ...value, name: event.target.value }))} /></label>
                    <fieldset className="rounded border p-3 md:col-span-2"><legend className="px-1 text-sm">Aggregate measures</legend><label className="mr-5 text-sm"><input type="checkbox" checked={definitionForm.births} onChange={(event) => setDefinitionForm((value) => ({ ...value, births: event.target.checked }))} /> Verified birth count</label><label className="text-sm"><input type="checkbox" checked={definitionForm.deaths} onChange={(event) => setDefinitionForm((value) => ({ ...value, deaths: event.target.checked }))} /> Verified death count</label></fieldset>
                    <label className="text-sm md:col-span-2">Official form reference (only after facility supplies a validated form)<input className="mt-1 w-full rounded border p-2" value={definitionForm.formReference} onChange={(event) => setDefinitionForm((value) => ({ ...value, formReference: event.target.value }))} /></label>
                    <label className="flex items-start gap-2 text-sm md:col-span-2"><input type="checkbox" className="mt-1" checked={definitionForm.officialMapping} onChange={(event) => setDefinitionForm((value) => ({ ...value, officialMapping: event.target.checked }))} /><span>Facility has validated the official mapping<span className="block text-xs text-slate-500">This flag makes no mapping official by itself; retain the supplied form and local approval evidence.</span></span></label>
                    <div className="md:col-span-2"><Button type="submit" disabled={busy}>Save report definition version</Button></div>
                </form>
                {definitions.length ? <div className="mt-4 space-y-2">{definitions.map((definition) => <div key={definition.id} className="rounded border p-3 text-sm"><strong>{definition.report_name}</strong> · {definition.report_key} · v{definition.version}{definition.active ? ' · active' : ' · inactive'}<p className="text-xs text-slate-500">{(definition.definition?.measures || []).join(', ')} · {definition.official_mapping ? 'facility marked official mapping' : 'illustrative / unmapped'}</p></div>)}</div> : <p className="mt-4 rounded bg-slate-50 p-3 text-sm text-slate-600">No report definitions are configured. The illustrative sample appears when migration 69 seeds it; it is not an official mapping.</p>}
            </Card>
            <Card title="Small-cell suppression rule" subtitle="Configure the facility’s approved minimum count. No default threshold is applied.">
                <form className="grid gap-3 md:grid-cols-2" onSubmit={saveCellRule}><label className="text-sm">Minimum cell count<input type="number" min="2" className="mt-1 w-full rounded border p-2" value={cellRule.minimum} onChange={(event) => setCellRule((value) => ({ ...value, minimum: event.target.value }))} placeholder="No suppression rule" /></label><label className="text-sm">Policy basis<input className="mt-1 w-full rounded border p-2" value={cellRule.basis} onChange={(event) => setCellRule((value) => ({ ...value, basis: event.target.value }))} placeholder="Required when a threshold is set" /></label><div className="md:col-span-2"><Button type="submit" disabled={busy}>Save suppression rule</Button></div></form>
                <p className="mt-3 text-sm text-slate-600">Current rule: {suppression?.minimum_cell_count == null ? 'No small-cell suppression configured.' : `cells below ${suppression.minimum_cell_count} are suppressed`} {suppression?.policy_basis ? `· ${suppression.policy_basis}` : ''}</p>
            </Card>
            <Card title="Generate and export facility report" subtitle="Generation is aggregate and facility-scoped. Exports record the recipient, purpose, payload hash, report version, and time.">
                <form className="grid gap-3 md:grid-cols-2" onSubmit={runReport}><label className="text-sm">Active report definition<select required className="mt-1 w-full rounded border p-2" value={reportForm.definition} onChange={(event) => setReportForm((value) => ({ ...value, definition: event.target.value }))}><option value="">Select report</option>{definitions.filter((row) => row.active).map((definition) => <option key={definition.id} value={definition.id}>{definition.report_name} · v{definition.version}{definition.official_mapping ? '' : ' (illustrative / unmapped)'}</option>)}</select></label><label className="text-sm">Period start<input required type="date" className="mt-1 w-full rounded border p-2" value={reportForm.start} onChange={(event) => setReportForm((value) => ({ ...value, start: event.target.value }))} /></label><label className="text-sm">Period end<input required type="date" className="mt-1 w-full rounded border p-2" value={reportForm.end} onChange={(event) => setReportForm((value) => ({ ...value, end: event.target.value }))} /></label><div className="flex items-end"><Button type="submit" disabled={busy}>Generate aggregate report</Button></div></form>
                {reportResult && <div className="mt-4 rounded border bg-slate-50 p-3"><h3 className="font-semibold">Report preview</h3><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(reportResult, null, 2)}</pre><div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-sm">Export recipient<input required className="mt-1 w-full rounded border p-2" value={reportForm.recipient} onChange={(event) => setReportForm((value) => ({ ...value, recipient: event.target.value }))} /></label><label className="text-sm">Export purpose<input required className="mt-1 w-full rounded border p-2" value={reportForm.purpose} onChange={(event) => setReportForm((value) => ({ ...value, purpose: event.target.value }))} /></label><Button onClick={exportReport} disabled={busy}>Export and log disclosure</Button></div></div>}
            </Card>
            <Card title="Audited report export log" subtitle="The database export RPC stores every exported aggregate and its disclosure metadata.">
                {exports.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Exported</th><th className="p-2">Period / version</th><th className="p-2">Recipient</th><th className="p-2">Purpose</th><th className="p-2">Payload SHA-256</th></tr></thead><tbody>{exports.map((entry) => <tr className="border-b" key={entry.id}><td className="p-2">{formatDateTime(entry.exported_at)}</td><td className="p-2">{entry.period_start} – {entry.period_end} · v{entry.report_version}</td><td className="p-2">{entry.recipient}</td><td className="p-2">{entry.purpose}</td><td className="p-2 font-mono text-xs">{entry.payload_sha256}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">No statutory report exports have been logged.</p>}
            </Card>
        </>}
    </section>;
};

export { VitalRegistryReportsPanel };

const VitalRegistryModule = () => <main className="space-y-6 p-6"><VitalRegistryReportsPanel /></main>;
export { VitalRegistryModule };
