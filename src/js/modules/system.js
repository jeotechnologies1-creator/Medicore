        // ==========================================
        // AUDIT LOGS MODULE
        // ==========================================
        const AuditModule = () => {
            const [filterSeverity, setFilterSeverity] = useState('all');

            const filteredLogs = seedData.auditLogs.filter(log => 
                filterSeverity === 'all' || log.severity === filterSeverity
            );

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Audit Logs</h2>
                            <p className="text-slate-500 mt-1">System activity and security monitoring</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" icon={Icons.Filter}>Filter</Button>
                            <Button variant="secondary" icon={Icons.Download}>Export</Button>
                        </div>
                    </div>

                    <Card>
                        <div className="flex gap-4 mb-6">
                            {['all', 'info', 'warning', 'critical'].map(sev => (
                                <button
                                    key={sev}
                                    onClick={() => setFilterSeverity(sev)}
                                    className={'px-4 py-2 rounded-lg text-sm font-medium transition-colors ' + (filterSeverity === sev ? 'bg-medical-100 text-medical-700' : 'text-slate-600 hover:bg-slate-100')}
                                >
                                    {sev.charAt(0).toUpperCase() + sev.slice(1)}
                                </button>
                            ))}
                        </div>

                        <DataTable
                            columns={[
                                { key: 'timestamp', title: 'Timestamp', render: (row) => formatDateTime(row.timestamp), className: 'whitespace-nowrap' },
                                { key: 'user', title: 'User', render: (row) => {
                                    const user = seedData.users.find(u => u.id === row.userId);
                                    return user ? (
                                        <div className="flex items-center gap-2">
                                            <Avatar name={user.name} size="sm" />
                                            <span>{user.name}</span>
                                        </div>
                                    ) : row.userId;
                                }},
                                { key: 'action', title: 'Action', render: (row) => <Badge variant="info">{row.action}</Badge> },
                                { key: 'entityType', title: 'Entity' },
                                { key: 'ipAddress', title: 'IP Address', className: 'font-mono text-xs' },
                                { key: 'severity', title: 'Severity', render: (row) => <Badge variant={row.severity === 'critical' ? 'danger' : row.severity === 'warning' ? 'warning' : 'default'}>{row.severity}</Badge> }
                            ]}
                            data={filteredLogs}
                            actions={(row) => (
                                <Button variant="ghost" size="sm" icon={Icons.Eye}>Details</Button>
                            )}
                        />
                    </Card>
                </div>
            );
        };

        // ==========================================
        // SETTINGS MODULE
        // ==========================================
        const SettingsModule = () => {
            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card title="General Settings">
                            <p className="text-sm leading-6 text-slate-600">Hospital identity details are not stored by this application yet. Configure them through your approved administration workflow instead of relying on placeholder values.</p>
                        </Card>

                        <Card title="System Configuration">
                            <p className="text-sm leading-6 text-slate-600">Locale, currency, and session controls are determined by your deployed Supabase and hosting configuration. No simulated preferences are shown here.</p>
                        </Card>

                        <Card title="Security Settings">
                            <p className="text-sm leading-6 text-slate-600">Authentication policy, multi-factor authentication, and session duration must be managed in Supabase Auth. This screen no longer makes unsupported security claims or exposes inactive controls.</p>
                        </Card>
                    </div>

                    <Card title="Department Configuration">
                        <DataTable
                            columns={[
                                { key: 'name', title: 'Department' },
                                { key: 'type', title: 'Type' },
                                { key: 'capacity', title: 'Capacity' },
                                { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge> }
                            ]}
                            data={seedData.wards}
                        />
                    </Card>
                </div>
            );
        };

        // ==========================================
