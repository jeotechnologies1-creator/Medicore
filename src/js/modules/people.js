        // MAIN APP LAYOUT
        // ==========================================
        const HRStaffModule = () => {
            const { user } = useAuth();
            const [officeForm, setOfficeForm] = useState({
                name: '',
                officeType: 'Clinic',
                specialty: 'General Medicine',
                location: '',
                phone: '',
                email: '',
                headDoctorId: ''
            });
            const [saving, setSaving] = useState(false);
            const [message, setMessage] = useState('');
            const [staffForm, setStaffForm] = useState({ fullName: '', email: '', password: '', role: 'doctor', department: '' });
            const [staffMessage, setStaffMessage] = useState('');
            const [creatingStaff, setCreatingStaff] = useState(false);

            const offices = seedData.offices || [];
            const experts = (seedData.users || []).filter(user => ['doctor', 'nurse', 'laboratory_scientist', 'pharmacist', 'radiographer', 'surgeon'].includes(user.role) || user.role.includes('doctor') || user.role.includes('nurse'));

            const handleCreateOffice = async () => {
                if (!officeForm.name || !officeForm.specialty) {
                    setMessage('Office name and specialty are required.');
                    return;
                }

                setSaving(true);
                setMessage('');
                try {
                    const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function'
                        ? window.MedicoreSupabase.getClient()
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
                        created_by: (seedData.users || [])[0]?.id || null
                    };

                    const { data, error } = await client.from('medical_offices').insert([payload]).select();
                    if (error) throw error;

                    const newOffice = normalizeOffices(data || [])[0];
                    const nextOffices = [...offices, newOffice];
                    seedData.offices = nextOffices;

                    if (officeForm.headDoctorId) {
                        await client.from('office_staff').insert([{
                            office_id: newOffice.id,
                            profile_id: officeForm.headDoctorId,
                            role: 'Lead Physician',
                            is_lead: true
                        }]).select();
                    }

                    setOfficeForm({ name: '', officeType: 'Clinic', specialty: 'General Medicine', location: '', phone: '', email: '', headDoctorId: '' });
                    setMessage('Medical office added successfully.');
                } catch (error) {
                    console.error(error);
                    setMessage(error.message || 'Unable to create the office right now.');
                } finally {
                    setSaving(false);
                }
            };

            const handleCreateStaff = async () => {
                if (user?.role !== 'super_admin') {
                    setStaffMessage('Only the system administrator can create staff accounts.');
                    return;
                }
                setCreatingStaff(true);
                setStaffMessage('');
                try {
                    const client = window.MedicoreSupabase?.getClient?.();
                    if (!client) throw new Error('Supabase client is not available.');
                    const { data, error } = await client.functions.invoke('create-staff', { body: staffForm });
                    if (error) throw error;
                    if (!data?.staff) throw new Error(data?.error || 'Unable to create the staff account.');
                    const created = normalizeUsers([data.staff])[0];
                    seedData.users = [...(seedData.users || []), created];
                    setStaffForm({ fullName: '', email: '', password: '', role: 'doctor', department: '' });
                    setStaffMessage(`${created.fullName} can now sign in.`);
                } catch (error) {
                    console.error(error);
                    setStaffMessage(error.message || 'Unable to create the staff account.');
                } finally {
                    setCreatingStaff(false);
                }
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Medical Offices</h2>
                            <p className="text-slate-500 mt-1">Create and manage clinical departments and specialized care hubs</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card title="Create Staff Account">
                            {user?.role === 'super_admin' ? (
                                <div className="space-y-4">
                                    <Input label="Full name" value={staffForm.fullName} onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })} />
                                    <Input label="Work email" type="email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} />
                                    <Input label="Temporary password" type="password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} />
                                    <Select label="Role" value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })} options={['doctor', 'nurse', 'receptionist', 'pharmacist', 'laboratory_scientist', 'radiographer', 'accountant'].map(value => ({ value, label: value.replaceAll('_', ' ') }))} />
                                    <Input label="Department" value={staffForm.department} onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })} />
                                    {staffMessage && <p className={'text-sm ' + (staffMessage.includes('now sign in') ? 'text-emerald-600' : 'text-red-600')}>{staffMessage}</p>}
                                    <Button variant="primary" className="w-full justify-center" onClick={handleCreateStaff} disabled={creatingStaff} icon={creatingStaff ? Icons.RefreshCw : Icons.UserPlus}>
                                        {creatingStaff ? 'Creating account...' : 'Create Staff Account'}
                                    </Button>
                                </div>
                            ) : <p className="text-sm text-slate-500">Staff accounts are created by the system administrator.</p>}
                        </Card>
                        <Card title="Create Office">
                            <div className="space-y-4">
                                <Input label="Office Name" value={officeForm.name} onChange={(e) => setOfficeForm({ ...officeForm, name: e.target.value })} />
                                <Select label="Office Type" value={officeForm.officeType} onChange={(e) => setOfficeForm({ ...officeForm, officeType: e.target.value })} options={[{ value: 'Clinic', label: 'Clinic' }, { value: 'Department', label: 'Department' }, { value: 'Specialty Center', label: 'Specialty Center' }, { value: 'Emergency Unit', label: 'Emergency Unit' }]} />
                                <Input label="Specialty" value={officeForm.specialty} onChange={(e) => setOfficeForm({ ...officeForm, specialty: e.target.value })} />
                                <Input label="Location" value={officeForm.location} onChange={(e) => setOfficeForm({ ...officeForm, location: e.target.value })} />
                                <Input label="Phone" value={officeForm.phone} onChange={(e) => setOfficeForm({ ...officeForm, phone: e.target.value })} />
                                <Input label="Email" type="email" value={officeForm.email} onChange={(e) => setOfficeForm({ ...officeForm, email: e.target.value })} />
                                <Select label="Head Doctor / Lead" value={officeForm.headDoctorId} onChange={(e) => setOfficeForm({ ...officeForm, headDoctorId: e.target.value })} options={[{ value: '', label: 'No lead assigned' }, ...experts.map((expert) => ({ value: expert.id, label: `${expert.name} (${expert.role})` }))]} />
                                {message && <p className={'text-sm ' + (message.includes('successfully') ? 'text-emerald-600' : 'text-red-600')}>{message}</p>}
                                <Button variant="primary" className="w-full justify-center" onClick={handleCreateOffice} disabled={saving} icon={saving ? Icons.RefreshCw : Icons.Plus}>
                                    {saving ? 'Creating...' : 'Create Office'}
                                </Button>
                            </div>
                        </Card>

                        <div className="lg:col-span-2">
                            <Card title="Existing Medical Offices">
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
                    </div>
                </div>
            );
        };

        const DoctorsModule = () => {
            const doctors = (seedData.users || []).filter(user => ['doctor', 'surgeon', 'specialist'].includes(user.role) || user.role.includes('doctor'));
            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Doctors & Clinical Staff</h2>
                            <p className="text-slate-500 mt-1">Manage physician rosters, specialties, and availability</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus}>Add Clinician</Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard title="Active Doctors" value={doctors.length} icon={Icons.Stethoscope} color="medical" />
                        <StatCard title="Specialties" value={new Set(doctors.map(doc => doc.department || 'General')).size} icon={Icons.ClipboardList} color="emerald" />
                        <StatCard title="On Call" value={Math.max(2, Math.ceil(doctors.length * 0.35))} icon={Icons.Activity} color="amber" />
                        <StatCard title="Avg. Patients" value={18} icon={Icons.Users} color="violet" />
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
                            actions={() => (
                                <Button variant="ghost" size="sm" icon={Icons.Eye}>View</Button>
                            )}
                        />
                    </Card>
                </div>
            );
        };
