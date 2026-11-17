import { getStoreValue, setStoreValue } from '../store.js';

        // MAIN APP LAYOUT
        // ==========================================
        const getEdgeFunctionErrorMessage = async (error, functionName) => {
            const response = error?.context;
            if (response && typeof response.clone === 'function') {
                try {
                    const body = await response.clone().json();
                    if (body?.error) return body.error;
                    if (body?.message) return body.message;
                } catch (parseError) {
                    try {
                        const text = await response.clone().text();
                        if (text) return text.slice(0, 500);
                    } catch (readError) {}
                }
            }
            if (error?.name === 'FunctionsFetchError') return `Could not reach the ${functionName} Edge Function. Check that it is deployed and that this browser can reach Supabase.`;
            if (error?.name === 'FunctionsRelayError') return `Supabase could not start the ${functionName} Edge Function. Check its deployment and Edge Function logs.`;
            return error?.message || `Unable to call the ${functionName} Edge Function.`;
        };

        const StaffCredentialsRosterPanel = () => {
            const { user } = useAuth();
            const client = window.OneMedSupabase?.getClient?.();
            const facilityId = user?.facility_id || user?.facilityId || '';
            const canManage = ['super_admin', 'hr_officer'].includes(user?.role);
            const [credentials, setCredentials] = useState([]);
            const [rules, setRules] = useState([]);
            const [alerts, setAlerts] = useState([]);
            const [leave, setLeave] = useState([]);
            const [rosters, setRosters] = useState([]);
            const [profiles, setProfiles] = useState([]);
            const [wards, setWards] = useState([]);
            const [error, setError] = useState('');
            const [notice, setNotice] = useState('');
            const [busy, setBusy] = useState(false);
            const [credential, setCredential] = useState({ profile: '', body: '', number: '', issued: '', expires: '', notes: '' });
            const [rule, setRule] = useState({ role: 'doctor', body: '', blocks: true });
            const [alertDays, setAlertDays] = useState('30');
            const [leaveForm, setLeaveForm] = useState({ type: 'annual', start: '', end: '', reason: '' });
            const [roster, setRoster] = useState({ profile: '', department: '', ward: '', start: '', end: '', role: '', notes: '' });
            const [reviewNotes, setReviewNotes] = useState({});

            const refresh = useCallback(async () => {
                if (!client || !facilityId) { setError('Staff workflows require an active facility connection.'); return; }
                const queries = [
                    client.from('staff_credentials').select('*').eq('facility_id', facilityId).order('expires_on'),
                    client.from('credential_signoff_rules').select('*').eq('facility_id', facilityId).order('clinical_role'),
                    client.from('staff_credential_alerts').select('*').order('created_at', { ascending: false }).limit(100),
                    client.from('staff_leave_requests').select('*').eq('facility_id', facilityId).order('requested_at', { ascending: false }),
                    client.from('duty_rosters').select('*').eq('facility_id', facilityId).order('starts_at', { ascending: true }),
                    client.from('profiles').select('id,full_name,role,department,facility_id,status').eq('facility_id', facilityId).eq('status', 'active').order('full_name'),
                    client.from('wards').select('id,name,facility_id').eq('facility_id', facilityId).order('name')
                ];
                const results = await Promise.all(queries);
                const failed = results.find((item) => item.error);
                if (failed) { setError(failed.error.message || 'Staff records could not be loaded. Check facility permissions.'); return; }
                setCredentials(results[0].data || []); setRules(results[1].data || []); setAlerts(results[2].data || []);
                setLeave(results[3].data || []); setRosters(results[4].data || []); setProfiles(results[5].data || []); setWards(results[6].data || []); setError('');
            }, [client, facilityId]);
            useEffect(() => { refresh(); }, [refresh]);

            const run = async (rpc, args, success) => {
                if (!client) return setError('Database connection is unavailable.');
                setBusy(true); setError(''); setNotice('');
                const { data, error: rpcError } = await client.rpc(rpc, args);
                setBusy(false);
                if (rpcError) setError(rpcError.message || 'Staff workflow action failed.');
                else { setNotice(success); await refresh(); return data; }
                return null;
            };
            const saveCredential = (event) => {
                event.preventDefault();
                run('record_staff_credential', { p_facility_id: facilityId, p_profile_id: credential.profile, p_body: credential.body, p_number: credential.number, p_issued_on: credential.issued, p_expires_on: credential.expires, p_notes: credential.notes || null }, 'Credential record saved.').then((id) => { if (id) setCredential({ profile: '', body: '', number: '', issued: '', expires: '', notes: '' }); });
            };
            const saveRule = (event) => { event.preventDefault(); run('configure_credential_signoff_rule', { p_facility_id: facilityId, p_role: rule.role, p_credential_body: rule.body, p_blocks: rule.blocks }, 'Credential sign-off rule saved.'); };
            const dispatchAlerts = () => run('notify_expiring_staff_credentials', { p_facility_id: facilityId, p_days_ahead: Number(alertDays) }, 'Credential expiry alerts were sent to credential holders and HR recipients.');
            const submitLeave = (event) => {
                event.preventDefault();
                run('submit_staff_leave_request', { p_facility_id: facilityId, p_leave_type: leaveForm.type, p_starts_on: leaveForm.start, p_ends_on: leaveForm.end, p_reason: leaveForm.reason }, 'Leave request submitted for HR review.').then((id) => { if (id) setLeaveForm({ type: 'annual', start: '', end: '', reason: '' }); });
            };
            const submitRoster = (event) => {
                event.preventDefault();
                run('create_duty_roster', { p_facility_id: facilityId, p_profile_id: roster.profile, p_department: roster.department, p_ward_id: roster.ward || null, p_starts_at: new Date(roster.start).toISOString(), p_ends_at: new Date(roster.end).toISOString(), p_duty_role: roster.role, p_notes: roster.notes || null }, 'Duty roster entry created.');
            };
            const personName = (id) => profiles.find((item) => item.id === id)?.full_name || id;

            return <section aria-label="Staff credentials, leave, and rosters" className="space-y-6">
                <div><h2 className="text-xl font-bold text-slate-900">Staff credentials, leave & duty rosters</h2><p className="mt-1 text-sm text-slate-600">Credential expiry alerts, leave decisions, and ward or department assignments for this facility.</p></div>
                {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
                {canManage && <div className="grid gap-5 xl:grid-cols-2">
                    <Card title="Record staff credential" subtitle="Credential numbers and dates are facility-scoped and audited."><form className="grid gap-3 md:grid-cols-2" onSubmit={saveCredential}>
                        <label className="text-sm md:col-span-2">Staff member<select required className="mt-1 w-full rounded border p-2" value={credential.profile} onChange={(e) => setCredential({ ...credential, profile: e.target.value })}><option value="">Select staff</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {p.role}</option>)}</select></label>
                        <label className="text-sm">Credential body<input required className="mt-1 w-full rounded border p-2" value={credential.body} onChange={(e) => setCredential({ ...credential, body: e.target.value })} placeholder="Issuing board or authority" /></label><label className="text-sm">Credential number<input required className="mt-1 w-full rounded border p-2" value={credential.number} onChange={(e) => setCredential({ ...credential, number: e.target.value })} /></label>
                        <label className="text-sm">Issued on<input required type="date" className="mt-1 w-full rounded border p-2" value={credential.issued} onChange={(e) => setCredential({ ...credential, issued: e.target.value })} /></label><label className="text-sm">Expires on<input required type="date" className="mt-1 w-full rounded border p-2" value={credential.expires} onChange={(e) => setCredential({ ...credential, expires: e.target.value })} /></label>
                        <label className="text-sm md:col-span-2">Notes<input className="mt-1 w-full rounded border p-2" value={credential.notes} onChange={(e) => setCredential({ ...credential, notes: e.target.value })} /></label><Button type="submit" disabled={busy}>Save credential</Button>
                    </form></Card>
                    <Card title="Credential expiry alerts" subtitle="The server sends notices to credential holders and facility HR staff."><div className="flex items-end gap-3"><label className="text-sm">Alert window (days)<input type="number" min="0" className="mt-1 w-36 rounded border p-2" value={alertDays} onChange={(e) => setAlertDays(e.target.value)} /></label><Button onClick={dispatchAlerts} disabled={busy}>Send expiry alerts</Button></div><p className="mt-3 text-xs text-slate-500">{alerts.length} alert records are visible to their recipients and credential managers.</p></Card>
                    <Card title="Credential sign-off rules" subtitle="This is a facility-configured control; no roles or credential types are assumed by default."><form className="grid gap-3 md:grid-cols-2" onSubmit={saveRule}><label className="text-sm">Clinical role<input required className="mt-1 w-full rounded border p-2" value={rule.role} onChange={(e) => setRule({ ...rule, role: e.target.value })} /></label><label className="text-sm">Required credential body<input required className="mt-1 w-full rounded border p-2" value={rule.body} onChange={(e) => setRule({ ...rule, body: e.target.value })} /></label><label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={rule.blocks} onChange={(e) => setRule({ ...rule, blocks: e.target.checked })} />Block clinical sign-off when this credential is missing, revoked, or expired</label><Button type="submit" disabled={busy}>Save sign-off rule</Button></form><div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm"><strong>Where it applies:</strong> the database blocks insertion of consultation signatures and admission discharge signatures when a matching blocking rule has no active, unexpired credential. The UI message is informational; the server trigger is authoritative.</div><ul className="mt-3 space-y-1 text-sm">{rules.map((item) => <li key={item.id}>{item.clinical_role} · {item.credential_body}: {item.blocks_signoff ? 'blocks missing or expired credential' : 'warning only'}</li>)}</ul></Card>
                    <Card title="Create duty roster entry" subtitle="Assign an active facility staff member to a ward or department and shift."><form className="grid gap-3 md:grid-cols-2" onSubmit={submitRoster}><label className="text-sm md:col-span-2">Staff member<select required className="mt-1 w-full rounded border p-2" value={roster.profile} onChange={(e) => setRoster({ ...roster, profile: e.target.value })}><option value="">Select staff</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name} · {p.role}</option>)}</select></label><label className="text-sm">Department<input required className="mt-1 w-full rounded border p-2" value={roster.department} onChange={(e) => setRoster({ ...roster, department: e.target.value })} /></label><label className="text-sm">Ward (optional)<select className="mt-1 w-full rounded border p-2" value={roster.ward} onChange={(e) => setRoster({ ...roster, ward: e.target.value })}><option value="">Department roster</option>{wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label className="text-sm">Shift starts<input required type="datetime-local" className="mt-1 w-full rounded border p-2" value={roster.start} onChange={(e) => setRoster({ ...roster, start: e.target.value })} /></label><label className="text-sm">Shift ends<input required type="datetime-local" className="mt-1 w-full rounded border p-2" value={roster.end} onChange={(e) => setRoster({ ...roster, end: e.target.value })} /></label><label className="text-sm">Duty role<input required className="mt-1 w-full rounded border p-2" value={roster.role} onChange={(e) => setRoster({ ...roster, role: e.target.value })} /></label><label className="text-sm">Notes<input className="mt-1 w-full rounded border p-2" value={roster.notes} onChange={(e) => setRoster({ ...roster, notes: e.target.value })} /></label><Button type="submit" disabled={busy}>Add roster entry</Button></form></Card>
                </div>}
                <div className="grid gap-5 xl:grid-cols-2">
                    <Card title="Credential register"><div className="space-y-2">{credentials.length ? credentials.map((c) => <article key={c.id} className="rounded border p-3 text-sm"><strong>{personName(c.profile_id)}</strong> · {c.credential_body} · {c.credential_number}<p className="text-xs text-slate-500">Expires {c.expires_on} · {c.status}</p></article>) : <p className="text-sm text-slate-500">No credentials are recorded for this facility.</p>}</div></Card>
                    <Card title={canManage ? 'Leave requests for review' : 'My leave requests'}><form className="mb-4 grid gap-3 md:grid-cols-2" onSubmit={submitLeave}><label className="text-sm">Leave type<input required className="mt-1 w-full rounded border p-2" value={leaveForm.type} onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })} /></label><label className="text-sm">Reason<input required className="mt-1 w-full rounded border p-2" value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} /></label><label className="text-sm">Starts<input required type="date" className="mt-1 w-full rounded border p-2" value={leaveForm.start} onChange={(e) => setLeaveForm({ ...leaveForm, start: e.target.value })} /></label><label className="text-sm">Ends<input required type="date" className="mt-1 w-full rounded border p-2" value={leaveForm.end} onChange={(e) => setLeaveForm({ ...leaveForm, end: e.target.value })} /></label><Button type="submit" disabled={busy}>Submit leave request</Button></form><div className="space-y-2">{leave.length ? leave.map((row) => <article key={row.id} className="rounded border p-3 text-sm"><strong>{canManage ? personName(row.profile_id) : 'My request'} · {row.leave_type}</strong> · {row.status}<p>{row.starts_on} – {row.ends_on} · {row.reason}</p>{canManage && row.status === 'pending' && row.profile_id === user?.id && <p className="mt-2 text-xs text-slate-500">You cannot review your own leave request.</p>}{canManage && row.status === 'pending' && row.profile_id !== user?.id && <div className="mt-2 flex flex-wrap gap-2"><input aria-label={`Review note for ${row.id}`} className="rounded border p-2" value={reviewNotes[row.id] || ''} onChange={(e) => setReviewNotes({ ...reviewNotes, [row.id]: e.target.value })} placeholder="Decision note" />{['approved', 'rejected'].map((decision) => <Button key={decision} size="sm" variant="secondary" disabled={busy} onClick={() => run('review_staff_leave_request', { p_request_id: row.id, p_decision: decision, p_note: reviewNotes[row.id] || null }, `Leave request ${decision}.`)}>{decision}</Button>)}</div>}</article>) : <p className="text-sm text-slate-500">No leave requests are available.</p>}</div></Card>
                    <Card title="Ward and department rosters"><div className="space-y-2">{rosters.length ? rosters.map((row) => <article key={row.id} className="rounded border p-3 text-sm"><strong>{row.department}</strong>{row.ward_id ? ` · ${wards.find((w) => w.id === row.ward_id)?.name || 'Ward'}` : ''} · {row.duty_role}<p>{personName(row.profile_id)} · {new Date(row.starts_at).toLocaleString()} – {new Date(row.ends_at).toLocaleString()}</p></article>) : <p className="text-sm text-slate-500">No duty roster entries are scheduled for this facility.</p>}</div></Card>
                </div>
                <div className="flex justify-end"><Button size="sm" variant="secondary" onClick={refresh}>Refresh staff workflows</Button></div>
            </section>;
        };

        const StaffLeaveModule = () => {
            const { user } = useAuth();
            const client = window.OneMedSupabase?.getClient?.();
            const facilityId = user?.facility_id || user?.facilityId || '';
            const [rows, setRows] = useState([]);
            const [form, setForm] = useState({ type: 'annual', start: '', end: '', reason: '' });
            const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
            const refresh = useCallback(async () => {
                if (!client || !facilityId) { setError('Leave requests require an active facility profile.'); return; }
                const { data, error: queryError } = await client.from('staff_leave_requests').select('*').eq('facility_id', facilityId).order('requested_at', { ascending: false });
                if (queryError) setError(queryError.message || 'Your leave requests could not be loaded.');
                else { setRows(data || []); setError(''); }
            }, [client, facilityId]);
            useEffect(() => { refresh(); }, [refresh]);
            const submit = async (event) => {
                event.preventDefault(); setBusy(true); setError(''); setNotice('');
                const { error: rpcError } = await client.rpc('submit_staff_leave_request', { p_facility_id: facilityId, p_leave_type: form.type, p_starts_on: form.start, p_ends_on: form.end, p_reason: form.reason });
                setBusy(false);
                if (rpcError) setError(rpcError.message || 'Leave request could not be submitted.');
                else { setNotice('Leave request submitted for HR review.'); setForm({ type: 'annual', start: '', end: '', reason: '' }); await refresh(); }
            };
            return <main className="space-y-6 p-6"><section aria-label="My staff leave requests" className="space-y-5"><div><h2 className="text-2xl font-bold text-slate-900">My leave requests</h2><p className="mt-1 text-sm text-slate-600">Submit a request and track its HR review status.</p></div>{error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}<Card title="Submit leave request"><form className="grid gap-3 md:grid-cols-2" onSubmit={submit}><label className="text-sm">Leave type<input required className="mt-1 w-full rounded border p-2" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /></label><label className="text-sm">Reason<input required className="mt-1 w-full rounded border p-2" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label><label className="text-sm">Starts<input required type="date" className="mt-1 w-full rounded border p-2" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label><label className="text-sm">Ends<input required type="date" className="mt-1 w-full rounded border p-2" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label><Button type="submit" disabled={busy}>Submit leave request</Button></form></Card><Card title="Request history">{rows.length ? <div className="space-y-2">{rows.map((row) => <article key={row.id} className="rounded border p-3 text-sm"><strong>{row.leave_type}</strong> · <Badge>{row.status}</Badge><p>{row.starts_on} – {row.ends_on} · {row.reason}</p>{row.review_note && <p className="text-slate-500">HR note: {row.review_note}</p>}</article>)}</div> : <p className="text-sm text-slate-500">You have not submitted any leave requests.</p>}</Card></section></main>;
        };

        const HRStaffModule = () => {
            const { user } = useAuth();
            const [activeTab, setActiveTab] = useState('overview');
            const [staffForm, setStaffForm] = useState({ fullName: '', email: '', role: 'doctor', department: '' });
            const [staffMessage, setStaffMessage] = useState('');
            const [creatingStaff, setCreatingStaff] = useState(false);
            const staff = (getStoreValue("users") || []).filter((person) => person && ['doctor', 'nurse', 'receptionist', 'pharmacist', 'laboratory_scientist', 'radiographer', 'accountant', 'records_officer', 'surgeon', 'specialist', 'theatre_staff', 'super_admin'].includes(person.role));
            const activeStaff = staff.filter((person) => person.status === 'active').length;
            const attendanceRate = staff.length ? Math.round((activeStaff / staff.length) * 100) : 0;
            const departments = Array.from(new Set(staff.map((person) => person.department || 'General').filter(Boolean)));
            const roleBreakdown = [
                { label: 'Doctors', value: staff.filter((person) => person.role === 'doctor').length },
                { label: 'Nurses', value: staff.filter((person) => person.role === 'nurse').length },
                { label: 'Clinics', value: staff.filter((person) => person.department === 'Clinic').length },
                { label: 'Support', value: staff.filter((person) => ['receptionist', 'accountant', 'pharmacist'].includes(person.role)).length }
            ];
            const attendanceSummary = departments.map((department) => ({
                department,
                staff: staff.filter(person => person.department === department).length,
                active: staff.filter(person => person.department === department && person.status === 'active').length
            }));
            const payrollSummary = [];
            const recruitmentPipeline = [];
            const handleCreateStaff = async () => {
                if (user?.role !== 'super_admin') {
                    setStaffMessage(`This account's profile role is “${user?.role || 'unknown'}”. It must be “super_admin” to create staff accounts.`);
                    return;
                }
                if (!staffForm.fullName.trim() || !staffForm.email.trim()) {
                    setStaffMessage('Enter a name and work email.');
                    return;
                }
                setCreatingStaff(true);
                setStaffMessage('');
                try {
                    const client = window.OneMedSupabase?.getClient?.();
                    if (!client) throw new Error('Supabase client is not available.');
                    const { data, error } = await client.functions.invoke('create-staff', {
                        body: { ...staffForm, fullName: staffForm.fullName.trim(), email: staffForm.email.trim().toLowerCase() }
                    });
                    if (error) throw new Error(await getEdgeFunctionErrorMessage(error, 'create-staff'));
                    if (!data?.staff) throw new Error(data?.error || 'The function returned no staff profile. Check the create-staff Edge Function logs.');
                    setStoreValue("users", [...(getStoreValue("users") || []), normalizeUsers([data.staff])[0]]);
                    setStaffForm({ fullName: '', email: '', role: 'doctor', department: '' });
                    setStaffMessage(`Invitation sent to ${data.staff.email}. They can set their password using the email link.`);
                } catch (error) {
                    console.error('create-staff failed:', error);
                    setStaffMessage(error.message || 'Unable to create the staff account.');
                } finally {
                    setCreatingStaff(false);
                }
            };
            const tabs = [
                { id: 'overview', label: 'Overview' },
                { id: 'attendance', label: 'Attendance' },
                { id: 'payroll', label: 'Payroll' },
                { id: 'recruitment', label: 'Recruitment' }
            ];

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">HR & Staff</h2>
                            <p className="text-slate-500 mt-1">Workforce planning, attendance, payroll, and hiring operations</p>
                        </div>
                    </div>

                    {['super_admin', 'hr_officer'].includes(user?.role) && <StaffCredentialsRosterPanel />}

                    {user?.role !== 'super_admin' && <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        Staff account creation is available to active Super Admin profiles. Current profile role: <strong>{user?.role || 'unknown'}</strong>.
                    </p>}

                    {user?.role === 'super_admin' && <Card title="Create Staff Account">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input label="Full name" value={staffForm.fullName} onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })} />
                            <Input label="Work email" type="email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} />
                            <Select label="Role" value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })} options={['doctor', 'nurse', 'receptionist', 'records_officer', 'pharmacist', 'laboratory_scientist', 'radiographer', 'accountant', 'surgeon', 'specialist', 'theatre_staff'].map(value => ({ value, label: value === 'records_officer' ? 'Health Information Management Officer' : value.replaceAll('_', ' ') }))} />
                            <Input label="Department" value={staffForm.department} onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })} />
                            {staffMessage && <p role="status" className={'md:col-span-2 text-sm ' + (staffMessage.includes('Invitation sent') ? 'text-emerald-600' : 'text-red-600')}>{staffMessage}</p>}
                            <div className="md:col-span-2">
                                <Button variant="primary" className="w-full justify-center" onClick={handleCreateStaff} disabled={creatingStaff} icon={creatingStaff ? Icons.RefreshCw : Icons.UserPlus}>
                                    {creatingStaff ? 'Creating account...' : 'Create Staff Account'}
                                </Button>
                            </div>
                        </div>
                    </Card>}

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard title="Total Staff" value={staff.length} icon={Icons.Users} color="medical" />
                        <StatCard title="Active Staff" value={activeStaff} icon={Icons.UserCheck} color="emerald" />
                        <StatCard title="Attendance" value={`${attendanceRate}%`} icon={Icons.Calendar} color="amber" />
                        <StatCard title="Departments" value={departments.length} icon={Icons.Building2} color="violet" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'overview' && (
                        <>
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                                <Card title="Staffing KPIs" className="xl:col-span-2">
                                    <div className="space-y-5">
                                        {roleBreakdown.map((item) => (
                                            <div key={item.label}>
                                                <div className="flex items-center justify-between text-sm mb-2">
                                                    <span className="text-slate-600">{item.label}</span>
                                                    <span className="font-semibold text-slate-900">{item.value}</span>
                                                </div>
                                                <ProgressBar value={staff.length ? Math.round((item.value / staff.length) * 100) : 0} max={100} color={item.label.includes('Doctors') ? 'medical' : item.label.includes('Nurses') ? 'emerald' : item.label.includes('Clinics') ? 'amber' : 'violet'} />
                                            </div>
                                        ))}
                                    </div>
                                </Card>

                                <Card title="Shift Coverage">
                                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Shift coverage will appear when live roster assignments are available.</p>
                                </Card>
                            </div>

                            <div className="grid grid-cols-1 gap-6">
                                <Card title="Department Performance">
                                    <div className="space-y-4">
                                        {departments.length ? departments.map((department) => {
                                            const departmentStaff = staff.filter((person) => (person.department || 'General') === department).length;
                                            return (
                                                <div key={department} className="rounded-xl border border-slate-200 p-3">
                                                    <div className="flex justify-between text-sm mb-2">
                                                        <span className="font-medium text-slate-700">{department}</span>
                                                        <span className="text-slate-500">{departmentStaff} staff</span>
                                                    </div>
                                                    <ProgressBar value={staff.length ? Math.round((departmentStaff / staff.length) * 100) : 0} max={100} color="medical" />
                                                </div>
                                            );
                                        }) : <p className="text-sm text-slate-500">No departments configured yet.</p>}
                                    </div>
                                </Card>
                            </div>
                        </>
                    )}

                    {activeTab === 'attendance' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Department attendance">
                                <div className="space-y-4">
                                    {attendanceSummary.map((dept) => {
                                        const rate = dept.staff ? Math.round((dept.active / dept.staff) * 100) : 0;
                                        return (
                                        <div key={dept.department}>
                                            <div className="flex items-center justify-between text-sm mb-1">
                                                <span className="text-slate-600">{dept.department}</span>
                                                <span className="font-medium text-slate-900">{rate}%</span>
                                            </div>
                                            <ProgressBar value={rate} max={100} color={rate >= 90 ? 'emerald' : 'amber'} />
                                            <p className="mt-2 text-xs text-slate-500">{dept.staff} staff on roster</p>
                                        </div>
                                    ); })}
                                </div>
                            </Card>

                            <Card title="Late arrivals / absenteeism">
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                                    No attendance anomalies are currently recorded. This section will populate when staffing events are tracked.
                                </div>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'payroll' && (
                        <Card title="Payroll overview">
                            <DataTable
                                columns={[
                                    { key: 'employee', title: 'Employee' },
                                    { key: 'department', title: 'Department' },
                                    { key: 'gross', title: 'Gross', render: (row) => formatCurrency(row.gross) },
                                    { key: 'net', title: 'Net', render: (row) => formatCurrency(row.net) },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'Approved' ? 'success' : 'warning'}>{row.status}</Badge> }
                                ]}
                                data={payrollSummary}
                            />
                        </Card>
                    )}

                    {activeTab === 'recruitment' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Hiring pipeline">
                                <div className="space-y-4">
                                    {recruitmentPipeline.map((item) => (
                                        <div key={item.role} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-slate-800">{item.role}</span>
                                                <Badge variant={item.priority === 'High' ? 'warning' : 'info'}>{item.priority}</Badge>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                                                <span>{item.stage}</span>
                                                <span>{item.candidates} applicants</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card title="Onboarding checklist"><p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No onboarding records are available from Supabase.</p></Card>
                        </div>
                    )}

                    <Card title="Staff Directory">
                        <DataTable
                            columns={[
                                { key: 'name', title: 'Staff Member', render: (row) => (
                                    <div className="flex items-center gap-2">
                                        <Avatar name={row.name} size="sm" />
                                        <span>{row.name}</span>
                                    </div>
                                )},
                                { key: 'role', title: 'Role', render: (row) => <span className="capitalize">{String(row.role || 'staff').replaceAll('_', ' ')}</span> },
                                { key: 'department', title: 'Department' },
                                { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'warning'}>{row.status || 'active'}</Badge> },
                                { key: 'lastLogin', title: 'Last Login' }
                            ]}
                            data={staff}
                        />
                    </Card>
                </div>
            );
        };

        const MedicalOfficesModule = () => {
            const { user } = useAuth();
            const [officeForm, setOfficeForm] = useState({
                name: '',
                officeType: 'Clinic',
                specialty: '',
                location: '',
                phone: '',
                email: '',
                headDoctorId: ''
            });
            const [saving, setSaving] = useState(false);
            const [message, setMessage] = useState('');
            const [patientPortalForm, setPatientPortalForm] = useState({ patientId: '', email: '' });
            const [patientPortalMessage, setPatientPortalMessage] = useState('');
            const [creatingPatientPortal, setCreatingPatientPortal] = useState(false);

            const offices = getStoreValue("offices") || [];
            const experts = (getStoreValue("users") || []).filter((person) => ['doctor', 'nurse', 'laboratory_scientist', 'pharmacist', 'radiographer', 'surgeon'].includes(person.role) || person.role.includes('doctor') || person.role.includes('nurse'));
            const activeOffices = offices.filter((office) => office.status === 'active').length;
            const totalSpecialties = new Set(offices.map((office) => office.specialty).filter(Boolean)).size;
            const occupancyLoad = offices.length ? Math.round((offices.filter((office) => office.status === 'active').length / Math.max(1, offices.length)) * 100) : 0;
            const today = formatFacilityDate();
            const serviceLoad = [
                { label: 'Today\'s appointments', value: (getStoreValue("appointments") || []).filter((item) => item.date === today).length, color: 'medical' },
                { label: 'Emergency appointments', value: (getStoreValue("appointments") || []).filter((item) => item.date === today && String(item.department || '').toLowerCase().includes('emergency')).length, color: 'red' },
                { label: 'Pending lab orders', value: (getStoreValue("labOrders") || []).filter((item) => item.status !== 'completed').length, color: 'amber' },
                { label: 'Active admissions', value: (getStoreValue("admissions") || []).filter((item) => item.status === 'active').length, color: 'emerald' }
            ];

            const handleCreateOffice = async () => {
                if (!officeForm.name || !officeForm.specialty) {
                    setMessage('Office name and specialty are required.');
                    return;
                }

                setSaving(true);
                setMessage('');
                try {
                    const client = window.OneMedSupabase && typeof window.OneMedSupabase.getClient === 'function'
                        ? window.OneMedSupabase.getClient()
                        : null;

                    if (!client) {
                        throw new Error('Supabase client is not available.');
                    }

                    const payload = {
                        name: officeForm.name,
                        office_type: officeForm.officeType,
                        specialty: officeForm.specialty,
                        location: officeForm.location,
                        phone: officeForm.phone,
                        email: officeForm.email,
                        status: 'active',
                        head_doctor_id: officeForm.headDoctorId || null,
                        created_by: user?.id || null
                    };

                    const { data, error } = await client.from('medical_offices').insert([payload]).select();
                    if (error) throw error;

                    const newOffice = normalizeOffices(data || [])[0];
                    setStoreValue("offices", [...offices, newOffice]);

                    if (officeForm.headDoctorId) {
                        const { error: officeStaffError } = await client.from('office_staff').insert([{
                            office_id: newOffice.id,
                            profile_id: officeForm.headDoctorId,
                            role: 'Lead Physician',
                            is_lead: true
                        }]).select();
                        if (officeStaffError) {
                            setMessage(`Office created, but the lead physician could not be assigned: ${officeStaffError.message}`);
                            return;
                        }
                    }

                    setOfficeForm({ name: '', officeType: 'Clinic', specialty: '', location: '', phone: '', email: '', headDoctorId: '' });
                    setMessage('Medical office added successfully.');
                } catch (error) {
                    console.error(error);
                    setMessage(error.message || 'Unable to create the office right now.');
                } finally {
                    setSaving(false);
                }
            };

            const handleCreatePatientPortal = async () => {
                if (user?.role !== 'super_admin') return setPatientPortalMessage('Only a super admin can create patient portal accounts.');
                if (!patientPortalForm.patientId || !patientPortalForm.email) return setPatientPortalMessage('Choose a patient and enter their email.');
                setCreatingPatientPortal(true);
                setPatientPortalMessage('');
                try {
                    const client = window.OneMedSupabase?.getClient?.();
                    if (!client) throw new Error('Supabase client is not available.');
                    const { data, error } = await client.functions.invoke('create-patient-portal', { body: { ...patientPortalForm, email: patientPortalForm.email.trim() } });
                    if (error) throw new Error(await getEdgeFunctionErrorMessage(error, 'create-patient-portal'));
                    if (!data?.patient) throw new Error(data?.error || 'Unable to create the patient portal account.');
                    setPatientPortalForm({ patientId: '', email: '' });
                    setPatientPortalMessage('Invitation sent. The patient can set their password using the email link.');
                } catch (error) {
                    setPatientPortalMessage(error.message || 'Unable to create the patient portal account.');
                } finally {
                    setCreatingPatientPortal(false);
                }
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Medical Offices</h2>
                            <p className="text-slate-500 mt-1">Clinic network, specialty hubs, and office-level operational performance</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus} onClick={() => document.getElementById('medical-office-setup')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>New Office</Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard title="Active Offices" value={activeOffices} icon={Icons.Building2} color="medical" />
                        <StatCard title="Specialties" value={totalSpecialties} icon={Icons.Stethoscope} color="emerald" />
                        <StatCard title="Load Factor" value={`${occupancyLoad}%`} icon={Icons.Activity} color="amber" />
                        <StatCard title="Care Teams" value={experts.length} icon={Icons.Users} color="violet" />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <div id="medical-office-setup" className="xl:col-span-2"><Card title="Office Setup">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <Input label="Office Name" value={officeForm.name} onChange={(e) => setOfficeForm({ ...officeForm, name: e.target.value })} />
                                <Select label="Office Type" value={officeForm.officeType} onChange={(e) => setOfficeForm({ ...officeForm, officeType: e.target.value })} options={[{ value: 'Clinic', label: 'Clinic' }, { value: 'Department', label: 'Department' }, { value: 'Specialty Center', label: 'Specialty Center' }, { value: 'Emergency Unit', label: 'Emergency Unit' }]} />
                                <Input label="Specialty" value={officeForm.specialty} onChange={(e) => setOfficeForm({ ...officeForm, specialty: e.target.value })} />
                                <Input label="Location" value={officeForm.location} onChange={(e) => setOfficeForm({ ...officeForm, location: e.target.value })} />
                                <Input label="Phone" value={officeForm.phone} onChange={(e) => setOfficeForm({ ...officeForm, phone: e.target.value })} />
                                <Input label="Email" type="email" value={officeForm.email} onChange={(e) => setOfficeForm({ ...officeForm, email: e.target.value })} />
                                <div className="lg:col-span-2">
                                    <Select label="Lead Physician" value={officeForm.headDoctorId} onChange={(e) => setOfficeForm({ ...officeForm, headDoctorId: e.target.value })} options={[{ value: '', label: 'No lead assigned' }, ...experts.map((expert) => ({ value: expert.id, label: `${expert.name} (${expert.role})` }))]} />
                                </div>
                                {message && <div className="lg:col-span-2 text-sm text-emerald-600">{message}</div>}
                                <div className="lg:col-span-2">
                                    <Button variant="primary" className="w-full justify-center" onClick={handleCreateOffice} disabled={saving} icon={saving ? Icons.RefreshCw : Icons.Plus}>
                                        {saving ? 'Creating office...' : 'Create Office'}
                                    </Button>
                                </div>
                            </div>
                        </Card></div>

                        <Card title="Live Service Load">
                            <div className="space-y-4">
                                {serviceLoad.map((service) => (
                                    <div key={service.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-medium text-slate-700">{service.label}</span>
                                            <span className="text-sm text-slate-500">{service.value}</span>
                                        </div>
                                        <ProgressBar value={service.value} max={Math.max(1, ...serviceLoad.map((item) => item.value))} color={service.color} />
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {user?.role === 'super_admin' && <Card title="Create Patient Portal Account">
                            <div className="space-y-4">
                                <Select label="Patient record" value={patientPortalForm.patientId} onChange={(e) => setPatientPortalForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(getStoreValue("patients") || []).map(patient => ({ value: patient.id, label: `${patient.firstName} ${patient.lastName} · ${patient.patientNumber || patient.id}` }))]} />
                                <Input label="Patient email" type="email" value={patientPortalForm.email} onChange={(e) => setPatientPortalForm(prev => ({ ...prev, email: e.target.value }))} />
                                {patientPortalMessage && <p role="status" className={'text-sm ' + (patientPortalMessage.includes('Invitation sent') ? 'text-emerald-600' : 'text-red-600')}>{patientPortalMessage}</p>}
                                <Button variant="primary" className="w-full justify-center" onClick={handleCreatePatientPortal} disabled={creatingPatientPortal} icon={creatingPatientPortal ? Icons.RefreshCw : Icons.UserPlus}>{creatingPatientPortal ? 'Creating account...' : 'Create Patient Portal'}</Button>
                            </div>
                        </Card>}

                        <Card title="Office Portfolio">
                            <div className="space-y-3">
                                {(offices.length ? offices : [{ name: 'No offices configured', specialty: 'N/A', status: 'inactive' }]).map((office) => (
                                    <div key={office.name || 'empty-office'} className="rounded-xl border border-slate-200 p-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium text-slate-800">{office.name || 'No offices configured'}</p>
                                                <p className="text-xs text-slate-500">{office.specialty || 'Add a specialty'}</p>
                                            </div>
                                            <Badge variant={office.status === 'active' ? 'success' : 'default'}>{office.status || 'inactive'}</Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    <Card title="Medical Office Directory">
                        <DataTable
                            columns={[
                                { key: 'name', title: 'Office' },
                                { key: 'officeType', title: 'Type' },
                                { key: 'specialty', title: 'Specialty' },
                                { key: 'location', title: 'Location' },
                                { key: 'phone', title: 'Phone' },
                                { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge> }
                            ]}
                            data={offices}
                        />
                    </Card>
                </div>
            );
        };

        const DoctorsModule = () => {
            const { user } = useAuth();
            const [selectedClinician, setSelectedClinician] = useState(null);
            const doctors = (getStoreValue("users") || []).filter(user => ['doctor', 'surgeon', 'specialist'].includes(user.role) || user.role.includes('doctor'));
            const activeDoctors = doctors.filter(doc => doc.status === 'active');
            const specialties = new Set(activeDoctors.map(doc => doc.department || 'General')).size;
            const consultationsCount = (getStoreValue("consultations") || []).length;
            const avgPatientsPerDoctor = activeDoctors.length ? Math.round((getStoreValue("patients") || []).length / activeDoctors.length) : 0;

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Doctors & Clinical Staff</h2>
                            <p className="text-slate-500 mt-1">Manage physician rosters, specialties, and availability</p>
                        </div>
                        {user?.role === 'super_admin' && <Button variant="primary" icon={Icons.Plus} onClick={() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'hr' }))}>Add Clinician</Button>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard title="Active Doctors" value={activeDoctors.length} icon={Icons.Stethoscope} color="medical" />
                        <StatCard title="Specialties" value={specialties} icon={Icons.ClipboardList} color="emerald" />
                        <StatCard title="Consultations" value={consultationsCount} icon={Icons.Activity} color="amber" />
                        <StatCard title="Avg. Patients/Doctor" value={avgPatientsPerDoctor} icon={Icons.Users} color="violet" />
                    </div>

                    <Card>
                        <DataTable
                            columns={[
                                { key: 'name', title: 'Clinician', render: (row) => (
                                    <div className="flex items-center gap-2">
                                        <Avatar name={row.name} size="sm" />
                                        <span>{row.name}</span>
                                    </div>
                                )},
                                { key: 'department', title: 'Department' },
                                { key: 'role', title: 'Role' },
                                { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'warning'}>{row.status}</Badge> },
                                { key: 'lastLogin', title: 'Last Login' }
                            ]}
                            data={doctors}
                            actions={(row) => (
                                <Button variant="ghost" size="sm" icon={Icons.Eye} onClick={() => setSelectedClinician(row)}>View</Button>
                            )}
                        />
                    </Card>
                    <Modal isOpen={!!selectedClinician} onClose={() => setSelectedClinician(null)} title="Clinician details" size="sm">
                        {selectedClinician && <dl className="grid grid-cols-2 gap-4 text-sm">
                            <div className="col-span-2"><dt className="text-slate-500">Name</dt><dd className="font-medium text-slate-900">{selectedClinician.name || selectedClinician.fullName || 'Unknown'}</dd></div>
                            <div><dt className="text-slate-500">Role</dt><dd className="font-medium text-slate-900">{selectedClinician.role || '—'}</dd></div>
                            <div><dt className="text-slate-500">Department</dt><dd className="font-medium text-slate-900">{selectedClinician.department || '—'}</dd></div>
                            <div><dt className="text-slate-500">Status</dt><dd className="font-medium text-slate-900">{selectedClinician.status || '—'}</dd></div>
                            <div><dt className="text-slate-500">Last login</dt><dd className="font-medium text-slate-900">{selectedClinician.lastLogin || 'Not available'}</dd></div>
                        </dl>}
                    </Modal>
                </div>
            );
        };

export { getEdgeFunctionErrorMessage, HRStaffModule, StaffLeaveModule, MedicalOfficesModule, DoctorsModule };
