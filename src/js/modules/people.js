        // MAIN APP LAYOUT
        // ==========================================
        const HRStaffModule = () => {
            const staff = (seedData.users || []).filter((person) => person && ['doctor', 'nurse', 'receptionist', 'pharmacist', 'laboratory_scientist', 'radiographer', 'accountant', 'super_admin'].includes(person.role));
            const activeStaff = staff.filter((person) => person.status === 'active').length;
            const attendanceRate = staff.length ? Math.round((activeStaff / staff.length) * 100) : 0;
            const departments = Array.from(new Set(staff.map((person) => person.department || 'General').filter(Boolean)));
            const roleBreakdown = [
                { label: 'Doctors', value: staff.filter((person) => person.role === 'doctor').length },
                { label: 'Nurses', value: staff.filter((person) => person.role === 'nurse').length },
                { label: 'Clinics', value: staff.filter((person) => person.department === 'Clinic').length },
                { label: 'Support', value: staff.filter((person) => ['receptionist', 'accountant', 'pharmacist'].includes(person.role)).length }
            ];

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">HR & Staff</h2>
                            <p className="text-slate-500 mt-1">Workforce planning, staffing coverage, and operational readiness</p>
                        </div>
                        <Button variant="primary" icon={Icons.UserPlus}>Add Staff</Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard title="Total Staff" value={staff.length} icon={Icons.Users} color="medical" />
                        <StatCard title="Active Staff" value={activeStaff} icon={Icons.UserCheck} color="emerald" />
                        <StatCard title="Attendance" value={`${attendanceRate}%`} icon={Icons.CalendarCheck2} color="amber" />
                        <StatCard title="Departments" value={departments.length} icon={Icons.Building2} color="violet" />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <Card title="Staffing KPIs" className="xl:col-span-2">
                            <div className="space-y-5">
                                {roleBreakdown.map((item) => (
                                    <div key={item.label}>
                                        <div className="flex items-center justify-between text-sm mb-2">
                                            <span className="text-slate-600">{item.label}</span>
                                            <span className="font-semibold text-slate-900">{item.value}</span>
                                        </div>
                                        <ProgressBar value={Math.min(100, item.value * 12)} max={100} color={item.label.includes('Doctors') ? 'medical' : item.label.includes('Nurses') ? 'emerald' : item.label.includes('Clinics') ? 'amber' : 'violet'} />
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card title="Shift Coverage">
                            <div className="space-y-4">
                                {['Emergency', 'Inpatient', 'Outpatient', 'Diagnostics'].map((area, index) => (
                                    <div key={area} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-medium text-slate-700">{area}</span>
                                            <Badge variant={index < 2 ? 'success' : 'warning'}>{index < 2 ? 'Covered' : 'Watch'}</Badge>
                                        </div>
                                        <ProgressBar value={68 + index * 10} max={100} color={index < 2 ? 'emerald' : 'amber'} />
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card title="Add Staff Member">
                            <div className="space-y-4">
                                <Input label="Full name" />
                                <Input label="Email" type="email" />
                                <Select label="Role" options={[{ value: 'doctor', label: 'Doctor' }, { value: 'nurse', label: 'Nurse' }, { value: 'pharmacist', label: 'Pharmacist' }, { value: 'receptionist', label: 'Receptionist' }]} />
                                <Input label="Department" />
                                <Select label="Shift Pattern" options={[{ value: 'morning', label: 'Morning' }, { value: 'afternoon', label: 'Afternoon' }, { value: 'night', label: 'Night' }]} />
                                <Button variant="primary" className="w-full justify-center" icon={Icons.UserPlus}>Create Staff Profile</Button>
                            </div>
                        </Card>

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
                                            <ProgressBar value={Math.min(100, departmentStaff * 18)} max={100} color="medical" />
                                        </div>
                                    );
                                }) : <p className="text-sm text-slate-500">No departments configured yet.</p>}
                            </div>
                        </Card>
                    </div>

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
            const experts = (seedData.users || []).filter((person) => ['doctor', 'nurse', 'laboratory_scientist', 'pharmacist', 'radiographer', 'surgeon'].includes(person.role) || person.role.includes('doctor') || person.role.includes('nurse'));
            const activeOffices = offices.filter((office) => office.status === 'active').length;
            const totalSpecialties = new Set(offices.map((office) => office.specialty).filter(Boolean)).size;
            const occupancyLoad = offices.length ? Math.round((offices.filter((office) => office.status === 'active').length / Math.max(1, offices.length)) * 100) : 0;

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
                    seedData.offices = [...offices, newOffice];

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
                            <p className="text-slate-500 mt-1">Clinic network, specialty hubs, and office-level operational performance</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus}>New Office</Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <StatCard title="Active Offices" value={activeOffices} icon={Icons.Building2} color="medical" />
                        <StatCard title="Specialties" value={totalSpecialties} icon={Icons.Stethoscope} color="emerald" />
                        <StatCard title="Load Factor" value={`${occupancyLoad}%`} icon={Icons.Activity} color="amber" />
                        <StatCard title="Care Teams" value={experts.length} icon={Icons.Users} color="violet" />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <Card title="Office Setup" className="xl:col-span-2">
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
                        </Card>

                        <Card title="Clinical Capacity">
                            <div className="space-y-4">
                                {['Outpatient', 'Emergency', 'Diagnostics', 'Inpatient'].map((unit, index) => (
                                    <div key={unit} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-medium text-slate-700">{unit}</span>
                                            <span className="text-sm text-slate-500">{72 + index * 7}%</span>
                                        </div>
                                        <ProgressBar value={72 + index * 7} max={100} color={index % 2 === 0 ? 'medical' : 'emerald'} />
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card title="Create Staff Account">
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
                        </Card>

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
            const doctors = (seedData.users || []).filter(user => ['doctor', 'surgeon', 'specialist'].includes(user.role) || user.role.includes('doctor'));
            const activeDoctors = doctors.filter(doc => doc.status === 'active');
            const specialties = new Set(activeDoctors.map(doc => doc.department || 'General')).size;
            const consultationsCount = (seedData.consultations || []).length;
            const avgPatientsPerDoctor = activeDoctors.length ? Math.round((seedData.patients || []).length / activeDoctors.length) : 0;

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
                            actions={() => (
                                <Button variant="ghost" size="sm" icon={Icons.Eye}>View</Button>
                            )}
                        />
                    </Card>
                </div>
            );
        };
