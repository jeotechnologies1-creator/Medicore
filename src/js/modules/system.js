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
                            <div className="space-y-4">
                                <Input label="Hospital Name" value="MediCore General Hospital" onChange={() => {}} />
                                <Input label="Address" value="123 Healthcare Avenue, Medical City" onChange={() => {}} />
                                <Input label="Phone" value="+1-555-MEDICORE" onChange={() => {}} />
                                <Input label="Email" value="admin@medicore.com" type="email" onChange={() => {}} />
                                <Input label="Website" value="www.medicore.com" onChange={() => {}} />
                            </div>
                        </Card>

                        <Card title="System Configuration">
                            <div className="space-y-4">
                                <Select label="Timezone" options={[{ value: 'UTC', label: 'UTC' }, { value: 'EST', label: 'Eastern Time' }, { value: 'PST', label: 'Pacific Time' }]} value="UTC" onChange={() => {}} />
                                <Select label="Date Format" options={[{ value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' }, { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' }, { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }]} value="MM/DD/YYYY" onChange={() => {}} />
                                <Select label="Currency" options={[{ value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' }, { value: 'GBP', label: 'GBP (£)' }]} value="USD" onChange={() => {}} />
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-700">Auto-logout</span>
                                    <span className="text-sm font-medium text-slate-900">15 minutes</span>
                                </div>
                            </div>
                        </Card>

                        <Card title="Security Settings">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-700">Two-Factor Authentication</span>
                                    <Badge variant="success">Enabled</Badge>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-700">Password Expiry</span>
                                    <span className="text-sm font-medium text-slate-900">90 days</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-700">Session Timeout</span>
                                    <span className="text-sm font-medium text-slate-900">30 minutes</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-700">Audit Logging</span>
                                    <Badge variant="success">Active</Badge>
                                </div>
                                <Button variant="secondary" className="w-full" icon={Icons.Lock}>Change Password Policy</Button>
                            </div>
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
                            actions={() => (
                                <Button variant="ghost" size="sm" icon={Icons.Edit} />
                            )}
                        />
                    </Card>
                </div>
            );
        };

        // ==========================================
