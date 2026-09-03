        // ==========================================
        // DASHBOARD MODULE
        // ==========================================
        const DashboardModule = () => {
            const { user } = useAuth();
            const [timeRange, setTimeRange] = useState('today');
            
            const stats = useMemo(() => {
                const today = new Date('2026-09-01');
                return {
                    totalPatients: seedData.patients.length,
                    todayAppointments: seedData.appointments.filter(a => a.date === '2026-09-01').length,
                    pendingLabs: seedData.labOrders.filter(l => l.status === 'pending').length,
                    occupiedBeds: seedData.admissions.filter(a => a.status === 'active').length,
                    totalRevenue: seedData.billing.reduce((sum, b) => sum + parseFloat(b.paid), 0).toFixed(2),
                    criticalPatients: seedData.admissions.filter(a => a.acuity === 'critical').length,
                    pendingBills: seedData.billing.filter(b => b.status === 'pending' || b.status === 'partial').length,
                    staffOnline: seedData.users.filter(u => u.status === 'active').length
                };
            }, []);

            const recentActivity = seedData.auditLogs.slice(0, 10);

            const appointmentData = [
                { label: 'Mon', value: 12 },
                { label: 'Tue', value: 19 },
                { label: 'Wed', value: 15 },
                { label: 'Thu', value: 22 },
                { label: 'Fri', value: 18 },
                { label: 'Sat', value: 8 },
                { label: 'Sun', value: 5 },
            ];

            const revenueData = [
                { label: 'W1', value: 45000 },
                { label: 'W2', value: 52000 },
                { label: 'W3', value: 48000 },
                { label: 'W4', value: 61000 },
            ];

            const getRoleDashboard = () => {
                switch (user?.role) {
                    case 'doctor':
                        return (
                            <div className="space-y-6 animate-fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <StatCard title="Today's Appointments" value={stats.todayAppointments} icon={Icons.Calendar} color="medical" trend="up" trendValue="+3 from yesterday" />
                                    <StatCard title="Patients Waiting" value={8} icon={Icons.Users} color="amber" />
                                    <StatCard title="Pending Labs" value={stats.pendingLabs} icon={Icons.FlaskConical} color="violet" />
                                    <StatCard title="Prescriptions" value={12} icon={Icons.Pill} color="emerald" />
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <Card title="Today's Schedule" className="lg:col-span-2" action={<Button variant="ghost" size="sm" icon={Icons.Calendar}>View All</Button>}>
                                        <div className="space-y-3">
                                            {seedData.appointments.filter(a => a.date === '2026-09-01').slice(0, 5).map((apt) => {
                                                const patient = seedData.patients.find(p => p.id === apt.patientId);
                                                return (
                                                    <div key={apt.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                                                        <div className="text-center min-w-[60px]">
                                                            <p className="text-lg font-bold text-medical-600">{apt.time}</p>
                                                            <p className="text-xs text-slate-400">{apt.type}</p>
                                                        </div>
                                                        <Avatar name={patient?.firstName + ' ' + patient?.lastName} size="sm" />
                                                        <div className="flex-1">
                                                            <p className="font-medium text-slate-900">{patient?.firstName} {patient?.lastName}</p>
                                                            <p className="text-xs text-slate-500">{apt.department} - {apt.status}</p>
                                                        </div>
                                                        <Badge variant={apt.status === 'in-progress' ? 'info' : apt.status === 'completed' ? 'success' : 'default'}>{apt.status}</Badge>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </Card>
                                    <Card title="Quick Actions">
                                        <div className="space-y-2">
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.UserPlus}>New Consultation</Button>
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.FlaskConical}>Order Lab Test</Button>
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.Image}>Order Imaging</Button>
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.Pill}>Write Prescription</Button>
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.MessageSquare}>Message Patient</Button>
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        );
                    case 'nurse':
                        return (
                            <div className="space-y-6 animate-fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <StatCard title="Ward Occupancy" value={stats.occupiedBeds + '/132'} icon={Icons.Bed} color="medical" />
                                    <StatCard title="Vitals Due" value={15} icon={Icons.Activity} color="amber" />
                                    <StatCard title="Medications Due" value={23} icon={Icons.Syringe} color="emerald" />
                                    <StatCard title="Critical Patients" value={stats.criticalPatients} icon={Icons.AlertCircle} color="red" />
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <Card title="Bed Status" subtitle="Real-time ward occupancy">
                                        <div className="grid grid-cols-2 gap-4">
                                            {seedData.wards.map(ward => (
                                                <div key={ward.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-medium text-slate-700">{ward.name}</span>
                                                        <Badge variant={ward.occupied >= ward.capacity * 0.9 ? 'danger' : 'success'}>{ward.occupied}/{ward.capacity}</Badge>
                                                    </div>
                                                    <ProgressBar value={ward.occupied} max={ward.capacity} color={ward.occupied >= ward.capacity * 0.9 ? 'red' : 'medical'} size="sm" />
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                    <Card title="Vital Signs Alerts">
                                        <div className="space-y-3">
                                            {[1, 2, 3].map((i) => (
                                                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                                                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                                                        <Icons.AlertCircle size={20} className="text-red-600" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-slate-900">Room {100 + i} - Critical BP</p>
                                                        <p className="text-xs text-slate-500">Patient: John Doe - BP: 180/110</p>
                                                    </div>
                                                    <Button variant="danger" size="sm">Respond</Button>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        );
                    default:
                        return (
                            <div className="space-y-6 animate-fade-in">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-2xl font-bold text-slate-900">Dashboard Overview</h2>
                                    <div className="flex gap-2">
                                        {['today', 'week', 'month', 'year'].map((range) => (
                                            <button
                                                key={range}
                                                onClick={() => setTimeRange(range)}
                                                className={'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ' + (timeRange === range ? 'bg-medical-100 text-medical-700' : 'text-slate-600 hover:bg-slate-100')}
                                            >
                                                {range.charAt(0).toUpperCase() + range.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <StatCard title="Total Patients" value={stats.totalPatients} subtitle="Registered patients" icon={Icons.Users} color="medical" trend="up" trendValue="+12% this month" />
                                    <StatCard title="Today's Appointments" value={stats.todayAppointments} subtitle="Scheduled visits" icon={Icons.Calendar} color="emerald" />
                                    <StatCard title="Occupied Beds" value={stats.occupiedBeds + '/132'} subtitle="Current occupancy" icon={Icons.Bed} color="amber" />
                                    <StatCard title="Revenue" value={formatCurrency(stats.totalRevenue)} subtitle="Total collected" icon={Icons.DollarSign} color="teal" trend="up" trendValue="+8.5% this month" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <Card title="Appointment Trends" className="lg:col-span-2">
                                        <BarChart data={appointmentData} width={600} height={200} color="#2563eb" />
                                    </Card>
                                    <Card title="Department Distribution">
                                        <div className="space-y-4">
                                            {[
                                                { name: 'Cardiology', value: 28, color: 'bg-medical-500' },
                                                { name: 'Orthopedics', value: 22, color: 'bg-emerald-500' },
                                                { name: 'General Medicine', value: 35, color: 'bg-violet-500' },
                                                { name: 'Pediatrics', value: 15, color: 'bg-amber-500' },
                                            ].map((dept) => (
                                                <div key={dept.name}>
                                                    <div className="flex justify-between text-sm mb-1">
                                                        <span className="text-slate-700">{dept.name}</span>
                                                        <span className="font-medium text-slate-900">{dept.value}%</span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                                        <div className={dept.color + ' h-2 rounded-full transition-all'} style={{ width: dept.value + '%' }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <Card title="Revenue Overview">
                                        <LineChart data={revenueData} width={600} height={200} color="#059669" />
                                    </Card>
                                    <Card title="Recent Activity" action={<Button variant="ghost" size="sm">View All</Button>}>
                                        <div className="space-y-3">
                                            {recentActivity.map((log) => (
                                                <div key={log.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                                                    <div className={'w-2 h-2 rounded-full mt-2 flex-shrink-0 ' + (log.severity === 'critical' ? 'bg-red-500' : log.severity === 'warning' ? 'bg-amber-500' : 'bg-medical-500')} />
                                                    <div className="flex-1">
                                                        <p className="text-sm text-slate-900">
                                                            <span className="font-medium">{log.action}</span>
                                                            {' '}{log.entityType}
                                                        </p>
                                                        <p className="text-xs text-slate-500">{formatDateTime(log.timestamp)} - {log.ipAddress}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <Card title="Bed Occupancy by Ward">
                                        <div className="space-y-4">
                                            {seedData.wards.map(ward => (
                                                <div key={ward.id} className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-medium text-slate-900">{ward.name}</p>
                                                        <p className="text-xs text-slate-500">{ward.occupied} of {ward.capacity} beds</p>
                                                    </div>
                                                    <DonutChart value={ward.occupied} max={ward.capacity} size={60} strokeWidth={8} color={ward.occupied / ward.capacity > 0.9 ? '#ef4444' : '#2563eb'} />
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                    <Card title="Lab Workload" className="lg:col-span-2">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {[
                                                { label: 'Pending', value: seedData.labOrders.filter(l => l.status === 'pending').length, color: 'text-amber-600 bg-amber-50' },
                                                { label: 'Processing', value: seedData.labOrders.filter(l => l.status === 'processing').length, color: 'text-medical-600 bg-medical-50' },
                                                { label: 'Completed', value: seedData.labOrders.filter(l => l.status === 'completed').length, color: 'text-emerald-600 bg-emerald-50' },
                                                { label: 'Critical', value: seedData.labOrders.filter(l => l.status === 'critical').length, color: 'text-red-600 bg-red-50' },
                                            ].map(item => (
                                                <div key={item.label} className={'p-4 rounded-xl ' + item.color + ' text-center'}>
                                                    <p className="text-2xl font-bold">{item.value}</p>
                                                    <p className="text-xs font-medium mt-1">{item.label}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-4">
                                            <DataTable
                                                columns={[
                                                    { key: 'testType', title: 'Test' },
                                                    { key: 'category', title: 'Category' },
                                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'critical' ? 'danger' : row.status === 'completed' ? 'success' : 'warning'}>{row.status}</Badge> },
                                                    { key: 'priority', title: 'Priority', render: (row) => <Badge variant={row.priority === 'stat' ? 'danger' : row.priority === 'urgent' ? 'warning' : 'default'}>{row.priority}</Badge> }
                                                ]}
                                                data={seedData.labOrders.slice(0, 5)}
                                            />
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        );
                }
            };

            return (
                <div className="p-6">
                    {getRoleDashboard()}
                </div>
            );
        };

