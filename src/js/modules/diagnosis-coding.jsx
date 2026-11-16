const DiagnosisCodingPanel = () => {
    const { user } = useAuth();
    const client = window.OneMedSupabase?.getClient?.();
    const facilityId = user?.facility_id || user?.facilityId || '';
    const isCoder = ['records_officer', 'super_admin'].includes(user?.role);
    const isClinician = ['doctor', 'specialist', 'surgeon'].includes(user?.role);
    const [worklist, setWorklist] = useState([]);
    const [codes, setCodes] = useState({});
    const [queries, setQueries] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [deficiencies, setDeficiencies] = useState([]);
    const [codingMetrics, setCodingMetrics] = useState([]);
    const [auditMetrics, setAuditMetrics] = useState([]);
    const [systems, setSystems] = useState([]);
    const [loadedConceptCount, setLoadedConceptCount] = useState(0);
    const [staff, setStaff] = useState([]);
    const [selectedEncounter, setSelectedEncounter] = useState('');
    const [searchSystem, setSearchSystem] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [matches, setMatches] = useState([]);
    const [selectedConcept, setSelectedConcept] = useState(null);
    const [primary, setPrimary] = useState(false);
    const [questionDraft, setQuestionDraft] = useState({});
    const [responseDraft, setResponseDraft] = useState({});
    const [templateName, setTemplateName] = useState('');
    const [templateItems, setTemplateItems] = useState([{ key: '', label: '' }]);
    const [deficiencyDraft, setDeficiencyDraft] = useState({ encounter: '', template: '', itemKey: '', deficiency: '', clinician: '', dueDate: '' });
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        if (!client) { setError('Database connection is unavailable.'); setLoading(false); return; }
        setLoading(true);
        const jobs = isCoder ? [
            client.from('discharged_encounter_coding_worklist').select('*').order('discharged_at', { ascending: false }),
            client.from('chart_audit_templates').select('*').eq('facility_id', facilityId).order('template_name').order('version', { ascending: false }),
            client.from('chart_deficiencies').select('*').eq('facility_id', facilityId).order('due_date'),
            client.from('coding_completeness_by_department').select('*').eq('facility_id', facilityId).order('department'),
            client.from('chart_deficiency_compliance_by_department').select('*').eq('facility_id', facilityId).order('department'),
            client.from('profiles').select('id,full_name,role,department').eq('status', 'active').eq('facility_id', facilityId).in('role', ['doctor', 'specialist', 'surgeon']).order('full_name'),
            client.from('code_systems').select('code,name,version,loaded_at').order('name'),
            client.from('concepts').select('system', { count: 'exact', head: true }).eq('active', true),
            client.from('encounter_diagnosis_codes').select('*').eq('facility_id', facilityId),
            client.from('coding_clinician_queries').select('*').eq('facility_id', facilityId).order('asked_at', { ascending: false })
        ] : [
            client.from('coding_clinician_queries').select('*').eq('clinician_id', user?.id).eq('status', 'open').order('asked_at', { ascending: false })
        ];
        const results = await Promise.all(jobs);
        const failure = results.find((result) => result.error);
        if (failure) setError(isCoder ? 'Coding worklists could not be loaded. Check your facility access and coding permissions.' : 'Clinician queries could not be loaded.');
        else {
            if (isCoder) {
                const [work, templateResult, deficiencyResult, metrics, audit, profiles, codeSystemResult, conceptsResult, codeResult, queryResult] = results;
                setWorklist(work.data || []); setTemplates(templateResult.data || []); setDeficiencies(deficiencyResult.data || []);
                setCodingMetrics(metrics.data || []); setAuditMetrics(audit.data || []); setStaff(profiles.data || []);
                setSystems(codeSystemResult.data || []); setLoadedConceptCount(conceptsResult.count || 0);
                setCodes((codeResult.data || []).reduce((all, code) => ({ ...all, [code.encounter_id]: [...(all[code.encounter_id] || []), code] }), {}));
                setQueries(queryResult.data || []);
            } else setQueries(results[0].data || []);
            setError('');
        }
        setLoading(false);
    }, [client, facilityId, isCoder, user?.id]);

    useEffect(() => { refresh(); }, [refresh]);
    useEffect(() => {
        if (!isCoder || searchTerm.trim().length < 2 || !client) { setMatches([]); return undefined; }
        let current = true;
        const timer = window.setTimeout(async () => {
            let byDisplay = client.from('concepts').select('system,code,display').eq('active', true).ilike('display', `%${searchTerm.trim()}%`).limit(20);
            let byCode = client.from('concepts').select('system,code,display').eq('active', true).ilike('code', `${searchTerm.trim()}%`).limit(20);
            if (searchSystem) { byDisplay = byDisplay.eq('system', searchSystem); byCode = byCode.eq('system', searchSystem); }
            const [displayResult, codeResult] = await Promise.all([byDisplay, byCode]);
            const searchError = displayResult.error || codeResult.error;
            if (current) {
                const unique = new Map([...(displayResult.data || []), ...(codeResult.data || [])].map((concept) => [`${concept.system}:${concept.code}`, concept]));
                setMatches(errorSearchEmpty(searchError, [...unique.values()]));
                if (searchError) setError('Loaded terminology search is unavailable.');
            }
        }, 250);
        return () => { current = false; window.clearTimeout(timer); };
    }, [client, isCoder, searchSystem, searchTerm]);

    const submitRpc = async (name, args, success) => {
        if (!client) return setError('Database connection is unavailable.');
        setBusy(true); setError(''); setMessage('');
        const { error: rpcError } = await client.rpc(name, args);
        setBusy(false);
        if (rpcError) setError(rpcError.message || 'The requested change was denied or could not be saved.');
        else { setMessage(success); await refresh(); }
    };
    const assignCode = async (event) => {
        event.preventDefault();
        if (!selectedConcept || !selectedEncounter) return setError('Choose a loaded terminology result and discharged encounter.');
        await submitRpc('assign_encounter_diagnosis', { p_encounter_id: selectedEncounter, p_code_system: selectedConcept.system, p_code: selectedConcept.code, p_primary: primary }, 'Diagnosis code assigned from loaded terminology.');
        setSelectedConcept(null); setSearchTerm(''); setMatches([]);
    };
    const askQuestion = async (encounterId, codeId = null) => {
        const question = questionDraft[encounterId]?.trim();
        if (!question) return setError('Enter the clinician query before sending.');
        await submitRpc('ask_coding_clinician_query', { p_encounter_id: encounterId, p_diagnosis_code_id: codeId, p_question: question }, 'Clinician query sent.');
        setQuestionDraft((value) => ({ ...value, [encounterId]: '' }));
    };
    const respond = async (queryId) => {
        const response = responseDraft[queryId]?.trim();
        if (!response) return setError('Enter a response before submitting.');
        await submitRpc('respond_coding_clinician_query', { p_query_id: queryId, p_response: response }, 'Clinician response recorded.');
        setResponseDraft((value) => ({ ...value, [queryId]: '' }));
    };
    const saveTemplate = async (event) => {
        event.preventDefault();
        const items = templateItems.map((item) => ({ key: item.key.trim(), label: item.label.trim() }));
        await submitRpc('configure_chart_audit_template', { p_facility_id: facilityId, p_name: templateName, p_items: items }, 'Chart audit template version saved.');
        setTemplateName(''); setTemplateItems([{ key: '', label: '' }]);
    };
    const recordDeficiency = async (event) => {
        event.preventDefault();
        await submitRpc('record_chart_deficiency', { p_encounter_id: deficiencyDraft.encounter, p_template_id: deficiencyDraft.template || null, p_item_key: deficiencyDraft.itemKey || null, p_deficiency: deficiencyDraft.deficiency, p_assigned_clinician_id: deficiencyDraft.clinician, p_due_date: deficiencyDraft.dueDate }, 'Chart deficiency assigned.');
        setDeficiencyDraft((value) => ({ ...value, itemKey: '', deficiency: '' }));
    };
    const selectedTemplate = templates.find((template) => template.id === deficiencyDraft.template);

    if (!isCoder && !isClinician) return <Card title="Diagnosis coding and chart audit"><p role="alert" className="text-sm text-red-700">Permission denied. This workspace is available to authorized records officers and the treating clinician for assigned queries.</p></Card>;
    return <section className="space-y-6" aria-label="Diagnosis coding and chart deficiencies">
        <div><h2 className="text-xl font-bold text-slate-900">Diagnosis coding and chart audit</h2><p className="mt-1 text-sm text-slate-600">Discharged encounter coding, clinician queries, and chart completion follow-up.</p></div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={refresh}>Refresh coding workspace</Button></div>
        {isCoder && <>
            <Card title="Discharged encounter coder worklist" subtitle="Only discharged encounters visible to your facility coding permission are listed.">
                {loading ? <p className="text-sm text-slate-500">Loading discharged encounters…</p> : !worklist.length ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No discharged encounters are available in your facility coding worklist.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Encounter</th><th className="p-2">Department</th><th className="p-2">Discharged</th><th className="p-2">Codes</th><th className="p-2">Status</th></tr></thead><tbody>{worklist.map((row) => <tr key={row.encounter_id} className="border-b"><td className="p-2"><button className="font-medium text-medical-700 underline" onClick={() => setSelectedEncounter(row.encounter_id)}>{row.encounter_id.slice(0, 8)}</button></td><td className="p-2">{row.department || 'Unspecified'}</td><td className="p-2">{row.discharged_at ? formatDateTime(row.discharged_at) : row.discharge_date || '—'}</td><td className="p-2">{(codes[row.encounter_id] || []).length}</td><td className="p-2">{String(row.coding_status).replaceAll('_', ' ')}</td></tr>)}</tbody></table></div>}
            </Card>
            <Card title="Assign a loaded diagnosis code" subtitle="Search results come only from active concepts already loaded into the terminology catalog.">
                {!loadedConceptCount ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No diagnosis concepts are loaded. Load an approved code-system release before assigning diagnosis codes. Codes are never generated or guessed here.</p> : <form className="grid gap-3 md:grid-cols-2" onSubmit={assignCode}>
                    <label className="text-sm font-medium text-slate-700">Discharged encounter<select className="mt-1 w-full rounded-lg border border-slate-300 p-2" required value={selectedEncounter} onChange={(event) => setSelectedEncounter(event.target.value)}><option value="">Select encounter</option>{worklist.map((row) => <option key={row.encounter_id} value={row.encounter_id}>{row.encounter_id.slice(0, 8)} · {row.department}</option>)}</select></label>
                    <label className="text-sm font-medium text-slate-700">Loaded code system<select className="mt-1 w-full rounded-lg border border-slate-300 p-2" value={searchSystem} onChange={(event) => setSearchSystem(event.target.value)}><option value="">All loaded systems</option>{systems.map((system) => <option key={system.code} value={system.code}>{system.name}{system.version ? ` · ${system.version}` : ''}</option>)}</select></label>
                    <label className="text-sm font-medium text-slate-700 md:col-span-2">Search active diagnosis concepts<input className="mt-1 w-full rounded-lg border border-slate-300 p-2" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setSelectedConcept(null); }} placeholder="Enter at least two characters from a loaded concept" /></label>
                    {searchTerm.length >= 2 && !matches.length && <p className="text-sm text-slate-500 md:col-span-2">No matching active concepts in the loaded code systems.</p>}
                    {!!matches.length && <div className="max-h-52 space-y-1 overflow-auto md:col-span-2">{matches.map((concept) => <button type="button" key={`${concept.system}:${concept.code}`} onClick={() => setSelectedConcept(concept)} className={`block w-full rounded border p-2 text-left text-sm ${selectedConcept?.code === concept.code && selectedConcept?.system === concept.system ? 'border-medical-500 bg-medical-50' : 'border-slate-200'}`}><strong>{concept.display}</strong><span className="ml-2 text-slate-500">{concept.system} · {concept.code}</span></button>)}</div>}
                    {selectedConcept && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={primary} onChange={(event) => setPrimary(event.target.checked)} />Primary diagnosis</label>}
                    <div className="md:col-span-2"><Button type="submit" onClick={() => {}} disabled={busy || !selectedConcept || !selectedEncounter}>Assign selected code</Button></div>
                </form>}
                {!!selectedEncounter && (codes[selectedEncounter] || []).length > 0 && <div className="mt-4 space-y-2">{codes[selectedEncounter].map((code) => <div key={code.id} className="rounded border p-2 text-sm">{code.display_snapshot} · {code.code_system} {code.code}{code.primary_diagnosis ? ' · Primary' : ''}<div className="mt-2 flex gap-2"><input aria-label={`Question about ${code.display_snapshot}`} className="min-w-0 flex-1 rounded border p-2" value={questionDraft[selectedEncounter] || ''} onChange={(event) => setQuestionDraft((value) => ({ ...value, [selectedEncounter]: event.target.value }))} placeholder="Ask treating clinician for clarification" /><Button size="sm" onClick={() => askQuestion(selectedEncounter, code.id)}>Send query</Button></div></div>)}</div>}
            </Card>
            <Card title="Coding completeness by department">{codingMetrics.length ? <MetricTable rows={codingMetrics} label="Coding completeness" fields={['discharged_encounters', 'coded_encounters', 'encounters_with_open_queries', 'completeness_percent']} percent="completeness_percent" /> : <p className="text-sm text-slate-500">No discharged encounter coding metrics for this facility yet.</p>}</Card>
            <Card title="Clinician query queue">{queries.length ? queries.map((query) => <article key={query.id} className="mb-2 rounded border p-3 text-sm"><p><strong>{query.status === 'open' ? 'Awaiting clinician response' : 'Responded'}</strong> · {query.question}</p>{query.response && <p className="mt-1 text-slate-600">Response: {query.response}</p>}</article>) : <p className="text-sm text-slate-500">No clinician queries yet.</p>}</Card>
            <Card title="Chart audit template management" subtitle="Saving a template creates a new version and preserves prior audit history.">
                <form onSubmit={saveTemplate} className="space-y-3"><label className="block text-sm font-medium">Template name<input required className="mt-1 w-full rounded-lg border p-2" value={templateName} onChange={(event) => setTemplateName(event.target.value)} /></label>{templateItems.map((item, index) => <div key={index} className="grid gap-2 md:grid-cols-2"><label className="text-sm">Item key<input required className="mt-1 w-full rounded border p-2" value={item.key} onChange={(event) => setTemplateItems((items) => items.map((entry, at) => at === index ? { ...entry, key: event.target.value } : entry))} /></label><label className="text-sm">Item label<input required className="mt-1 w-full rounded border p-2" value={item.label} onChange={(event) => setTemplateItems((items) => items.map((entry, at) => at === index ? { ...entry, label: event.target.value } : entry))} /></label></div>)}<div className="flex gap-2"><Button variant="secondary" onClick={() => setTemplateItems((items) => [...items, { key: '', label: '' }])}>Add audit item</Button><Button type="submit" onClick={() => {}} disabled={busy}>Save template version</Button></div></form>
                <div className="mt-4 space-y-1 text-sm">{templates.filter((template) => template.active).map((template) => <p key={template.id}>{template.template_name} · v{template.version} · {template.items.length} items</p>)}{!templates.some((template) => template.active) && <p className="text-slate-500">No active chart audit templates configured.</p>}</div>
            </Card>
            <Card title="Record a chart deficiency" subtitle="Assign an open deficiency to an active clinician with a due date.">
                <form className="grid gap-3 md:grid-cols-2" onSubmit={recordDeficiency}><label className="text-sm">Discharged encounter<select required className="mt-1 w-full rounded border p-2" value={deficiencyDraft.encounter} onChange={(event) => setDeficiencyDraft((value) => ({ ...value, encounter: event.target.value }))}><option value="">Select encounter</option>{worklist.map((row) => <option key={row.encounter_id} value={row.encounter_id}>{row.encounter_id.slice(0, 8)} · {row.department}</option>)}</select></label><label className="text-sm">Audit template<select className="mt-1 w-full rounded border p-2" value={deficiencyDraft.template} onChange={(event) => setDeficiencyDraft((value) => ({ ...value, template: event.target.value, itemKey: '' }))}><option value="">No template item</option>{templates.filter((template) => template.active).map((template) => <option key={template.id} value={template.id}>{template.template_name} · v{template.version}</option>)}</select></label>{selectedTemplate && <label className="text-sm">Template item<select required className="mt-1 w-full rounded border p-2" value={deficiencyDraft.itemKey} onChange={(event) => setDeficiencyDraft((value) => ({ ...value, itemKey: event.target.value }))}><option value="">Select item</option>{selectedTemplate.items.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>}<label className="text-sm">Assign clinician<select required className="mt-1 w-full rounded border p-2" value={deficiencyDraft.clinician} onChange={(event) => setDeficiencyDraft((value) => ({ ...value, clinician: event.target.value }))}><option value="">Select clinician</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name} · {person.role}</option>)}</select></label><label className="text-sm">Due date<input required type="date" min={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded border p-2" value={deficiencyDraft.dueDate} onChange={(event) => setDeficiencyDraft((value) => ({ ...value, dueDate: event.target.value }))} /></label><label className="text-sm md:col-span-2">Deficiency<textarea required rows="2" className="mt-1 w-full rounded border p-2" value={deficiencyDraft.deficiency} onChange={(event) => setDeficiencyDraft((value) => ({ ...value, deficiency: event.target.value }))} /></label><div><Button type="submit" onClick={() => {}} disabled={busy || !worklist.length}>Assign deficiency</Button></div></form>
            </Card>
            <Card title="Chart deficiency queue">{deficiencies.length ? <div className="space-y-2">{deficiencies.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"><span><strong>{item.department}</strong> · {item.deficiency} · Due {item.due_date} · {staff.find((person) => person.id === item.assigned_clinician_id)?.full_name || 'Assigned clinician'} · {item.status}</span>{item.status === 'open' && <ResolveDeficiency item={item} onResolve={(resolution) => submitRpc('resolve_chart_deficiency', { p_deficiency_id: item.id, p_resolution: resolution }, 'Deficiency resolution recorded.')} />}</div>)}</div> : <p className="text-sm text-slate-500">No chart deficiencies in this facility queue.</p>}</Card>
            <Card title="Deficiency compliance by department">{auditMetrics.length ? <MetricTable rows={auditMetrics} label="Deficiency compliance" fields={['total_deficiencies', 'closed_deficiencies', 'overdue_deficiencies', 'compliance_percent']} percent="compliance_percent" /> : <p className="text-sm text-slate-500">No chart audit compliance metrics for this facility yet.</p>}</Card>
        </>}
        {isClinician && <Card title="Queries assigned to you" subtitle="Only open coding queries assigned to your clinician profile are shown.">{loading ? <p className="text-sm text-slate-500">Loading assigned queries…</p> : queries.length ? queries.map((query) => <article key={query.id} className="mb-3 rounded-lg border p-4"><p className="text-sm">{query.question}</p><textarea aria-label={`Response to query ${query.id.slice(0, 8)}`} className="mt-2 w-full rounded border p-2 text-sm" rows="3" value={responseDraft[query.id] || ''} onChange={(event) => setResponseDraft((value) => ({ ...value, [query.id]: event.target.value }))} /><div className="mt-2"><Button onClick={() => respond(query.id)} disabled={busy}>Submit response</Button></div></article>) : <p className="rounded bg-slate-50 p-4 text-sm text-slate-600">No open coding queries are assigned to you.</p>}</Card>}
    </section>;
};

const errorSearchEmpty = (error, data) => error ? [] : (data || []);
const MetricTable = ({ rows, label, fields, percent }) => <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{label} by department</caption><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Department</th>{fields.map((field) => <th className="p-2" key={field}>{field.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{rows.map((row) => <tr className="border-b" key={row.department}><td className="p-2">{row.department}</td>{fields.map((field) => <td className="p-2" key={field}>{field === percent ? `${Number(row[field] || 0).toFixed(2)}%` : Number(row[field] || 0).toLocaleString()}</td>)}</tr>)}</tbody></table></div>;
const ResolveDeficiency = ({ item, onResolve }) => {
    const [resolution, setResolution] = useState('');
    return <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); onResolve(resolution); }}><input className="rounded border p-2" aria-label={`Resolution for ${item.department} deficiency`} placeholder="Resolution" required value={resolution} onChange={(event) => setResolution(event.target.value)} /><Button size="sm" type="submit" onClick={() => {}}>Resolve</Button></form>;
};

export { DiagnosisCodingPanel };
