        // ==========================================
        // DASHBOARD MODULE
        // ==========================================
        const DashboardModule = () => {
            const { user } = useAuth();
            
            const today = new Date().toISOString().slice(0, 10);
            const stats = {
                totalPatients: appData.patients.length,
                todayAppointments: appData.appointments.filter(a => a.date === today).length,
                pendingLabs: appData.labOrders.filter(l => l.status === 'pending').length,
                occupiedBeds: appData.admissions.filter(a => a.status === 'active').length,
                totalRevenue: appData.billing.reduce((sum, b) => sum + Number(b.paid || 0), 0),
                criticalPatients: appData.admissions.filter(a => a.acuity === 'critical').length,
                pendingBills: appData.billing.filter(b => b.status === 'pending' || b.status === 'partial').length,
                staffOnline: appData.users.filter(u => u.status === 'active').length
            };

            const recentActivity = appData.auditLogs.slice(0, 10);

            const appointmentData = Array.from({ length: 7 }, (_, index) => {
                const date = new Date();
                date.setDate(date.getDate() - (6 - index));
                const dateKey = date.toISOString().slice(0, 10);
                return { label: date.toLocaleDateString(undefined, { weekday: 'short' }), value: appData.appointments.filter(appointment => appointment.date === dateKey).length };
            });
            const revenueData = Array.from({ length: 4 }, (_, index) => {
                const end = new Date();
                end.setDate(end.getDate() - ((3 - index) * 7));
                const start = new Date(end);
                start.setDate(start.getDate() - 6);
                const value = appData.billing.filter(invoice => {
                    const date = new Date(invoice.date);
                    return !Number.isNaN(date.valueOf()) && date >= start && date <= end;
                }).reduce((sum, invoice) => sum + Number(invoice.paid || 0), 0);
                return { label: `W${index + 1}`, value };
            });
            const departmentCounts = appData.appointments.reduce((counts, appointment) => {
                const department = appointment.department || 'Unassigned';
                counts[department] = (counts[department] || 0) + 1;
                return counts;
            }, {});
            const departmentTotal = Math.max(1, appData.appointments.length);
            const departments = Object.entries(departmentCounts).slice(0, 4).map(([name, count], index) => ({ name, value: Math.round((count / departmentTotal) * 100), color: ['bg-medical-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500'][index] }));
            const qualityEntries = (appData.auditLogs || []).filter((entry) => entry.riskScore || entry.readmissionRisk);
            const careCoordinationSummary = {
                highRiskCases: qualityEntries.filter((entry) => (entry.riskScore || entry.readmissionRisk || '').toLowerCase() === 'high').length,
                moderateRiskCases: qualityEntries.filter((entry) => (entry.riskScore || entry.readmissionRisk || '').toLowerCase() === 'moderate').length,
                dischargePlans: (appData.auditLogs || []).filter((entry) => entry.dischargePlan || entry.handoffNote).length,
                qualityReviews: (appData.auditLogs || []).filter((entry) => entry.auditNote || entry.idCheck !== undefined).length
            };

            const getRoleDashboard = () => {
                switch (user?.role) {
                    case 'doctor':
                        return (
                            <div className="space-y-6 animate-fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <StatCard title="Today's Appointments" value={stats.todayAppointments} icon={Icons.Calendar} color="medical" />
                                    <StatCard title="Patients Waiting" value={appData.appointments.filter(a => a.status === 'checked_in').length} icon={Icons.Users} color="amber" />
                                    <StatCard title="Pending Labs" value={stats.pendingLabs} icon={Icons.FlaskConical} color="violet" />
                                    <StatCard title="Prescriptions" value={appData.prescriptions.filter(p => p.status === 'active').length} icon={Icons.Pill} color="emerald" />
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <Card title="Today's Schedule" className="lg:col-span-2" action={<Button variant="ghost" size="sm" icon={Icons.Calendar} onClick={() => navigateTo('appointments')}>View All</Button>}>
                                        <div className="space-y-3">
                                            {appData.appointments.filter(a => a.date === today).slice(0, 5).map((apt) => {
                                                const patient = appData.patients.find(p => p.id === apt.patientId);
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
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.UserPlus} onClick={() => navigateTo('consultations')}>New Consultation</Button>
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.FlaskConical} onClick={() => navigateTo('laboratory')}>Order Lab Test</Button>
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.Image} onClick={() => navigateTo('radiology')}>Order Imaging</Button>
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.Pill} onClick={() => navigateTo('pharmacy')}>Write Prescription</Button>
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.MessageSquare} onClick={() => navigateTo('messages')}>Message Patient</Button>
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        );
                    case 'nurse':
                        return (
                            <div className="space-y-6 animate-fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <StatCard title="Ward Occupancy" value={stats.occupiedBeds + '/' + appData.wards.reduce((sum, ward) => sum + Number(ward.capacity || 0), 0)} icon={Icons.Bed} color="medical" />
                                    <StatCard title="Vitals Recorded" value={appData.vitals.filter(v => String(v.timestamp || '').slice(0, 10) === today).length} icon={Icons.Activity} color="amber" />
                                    <StatCard title="Active Medication Orders" value={appData.medicationOrders.filter(order => order.status === 'active').length} icon={Icons.Syringe} color="emerald" />
                                    <StatCard title="Critical Patients" value={stats.criticalPatients} icon={Icons.AlertCircle} color="red" />
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <Card title="Bed Status" subtitle="Real-time ward occupancy">
                                        <div className="grid grid-cols-2 gap-4">
                                            {appData.wards.map(ward => (
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
                                            {appData.clinicalAlerts.filter(alert => alert.status === 'open' && alert.severity === 'critical').slice(0, 3).map((alert) => (
                                                <div key={alert.id} className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                                                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                                                        <Icons.AlertCircle size={20} className="text-red-600" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-slate-900">Critical clinical alert</p>
                                                        <p className="text-xs text-slate-500">{alert.message}</p>
                                                    </div>
                                                    <Button variant="danger" size="sm" onClick={() => navigateTo('clinical_safety')}>Respond</Button>
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
                                <h2 className="text-2xl font-bold text-slate-900">Dashboard Overview</h2>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <StatCard title="Total Patients" value={stats.totalPatients} subtitle="Registered patients" icon={Icons.Users} color="medical" />
                                    <StatCard title="Today's Appointments" value={stats.todayAppointments} subtitle="Scheduled visits" icon={Icons.Calendar} color="emerald" />
                                    <StatCard title="Occupied Beds" value={stats.occupiedBeds + '/' + appData.wards.reduce((sum, ward) => sum + Number(ward.capacity || 0), 0)} subtitle="Current occupancy" icon={Icons.Bed} color="amber" />
                                    <StatCard title="Revenue" value={formatCurrency(stats.totalRevenue)} subtitle="Total collected" icon={Icons.DollarSign} color="teal" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <Card title="Appointment Trends" className="lg:col-span-2">
                                        <BarChart data={appointmentData} width={600} height={200} color="#2563eb" />
                                    </Card>
                                    <Card title="Department Distribution">
                                        <div className="space-y-4">
                                            {departments.map((dept) => (
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
                                    <Card title="Care Coordination & Quality">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="rounded-xl bg-red-50 p-3">
                                                <p className="text-xs uppercase tracking-wide text-red-600">High Risk</p>
                                                <p className="mt-2 text-2xl font-bold text-red-900">{careCoordinationSummary.highRiskCases}</p>
                                            </div>
                                            <div className="rounded-xl bg-amber-50 p-3">
                                                <p className="text-xs uppercase tracking-wide text-amber-600">Moderate Risk</p>
                                                <p className="mt-2 text-2xl font-bold text-amber-900">{careCoordinationSummary.moderateRiskCases}</p>
                                            </div>
                                            <div className="rounded-xl bg-medical-50 p-3">
                                                <p className="text-xs uppercase tracking-wide text-medical-600">Discharge Plans</p>
                                                <p className="mt-2 text-2xl font-bold text-medical-900">{careCoordinationSummary.dischargePlans}</p>
                                            </div>
                                            <div className="rounded-xl bg-emerald-50 p-3">
                                                <p className="text-xs uppercase tracking-wide text-emerald-600">Quality Reviews</p>
                                                <p className="mt-2 text-2xl font-bold text-emerald-900">{careCoordinationSummary.qualityReviews}</p>
                                            </div>
                                        </div>
                                        <div className="mt-4 space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-600">Follow-up readiness</span>
                                                <span className="font-medium text-slate-900">{Math.min(100, Math.round(((careCoordinationSummary.dischargePlans + careCoordinationSummary.qualityReviews) / Math.max(1, careCoordinationSummary.highRiskCases + careCoordinationSummary.moderateRiskCases + 4)) * 100))}%</span>
                                            </div>
                                            <ProgressBar value={Math.min(100, Math.round(((careCoordinationSummary.dischargePlans + careCoordinationSummary.qualityReviews) / Math.max(1, careCoordinationSummary.highRiskCases + careCoordinationSummary.moderateRiskCases + 4)) * 100))} max={100} color="emerald" size="sm" />
                                        </div>
                                    </Card>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <Card title="Recent Activity" action={<Button variant="ghost" size="sm" onClick={() => navigateTo('audit')}>View All</Button>}>
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
                                    <Card title="Quality Snapshot">
                                        <div className="space-y-4">
                                            {qualityEntries.length ? qualityEntries.slice(0, 4).map((entry) => (
                                                <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-sm font-medium text-slate-800">{entry.riskScore || entry.readmissionRisk || 'Quality review'}</span>
                                                        <Badge variant={(entry.riskScore || entry.readmissionRisk || '').toLowerCase() === 'high' ? 'danger' : (entry.riskScore || entry.readmissionRisk || '').toLowerCase() === 'moderate' ? 'warning' : 'success'}>{(entry.riskScore || entry.readmissionRisk || '').toLowerCase() === 'high' ? 'High' : (entry.riskScore || entry.readmissionRisk || '').toLowerCase() === 'moderate' ? 'Moderate' : 'Low'}</Badge>
                                                    </div>
                                                    <p className="mt-2 text-xs text-slate-500">{entry.auditNote || entry.handoffNote || entry.dischargePlan || 'Quality event recorded'}</p>
                                                </div>
                                            )) : (
                                                <p className="text-sm text-slate-500">No quality events are recorded yet. Safety and governance summaries will appear here when data is entered.</p>
                                            )}
                                        </div>
                                    </Card>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <Card title="Bed Occupancy by Ward">
                                        <div className="space-y-4">
                                            {appData.wards.map(ward => (
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
                                                { label: 'Pending', value: appData.labOrders.filter(l => l.status === 'pending').length, color: 'text-amber-600 bg-amber-50' },
                                                { label: 'Processing', value: appData.labOrders.filter(l => l.status === 'processing').length, color: 'text-medical-600 bg-medical-50' },
                                                { label: 'Completed', value: appData.labOrders.filter(l => l.status === 'completed').length, color: 'text-emerald-600 bg-emerald-50' },
                                                { label: 'Critical', value: appData.labOrders.filter(l => l.status === 'critical').length, color: 'text-red-600 bg-red-50' },
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
                                                data={appData.labOrders.slice(0, 5)}
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
