        // ==========================================
        // OPERATIONS COMMAND CENTRE
        // ==========================================
        const OperationsModule = () => {
            const [activeTab, setActiveTab] = useState('flow');
            const [selectedDept, setSelectedDept] = useState('all');

            const activeAdmissions = (seedData.admissions || []).filter(item => item.status === 'active');
            const managementDepartments = (seedData.wards || []).map((ward) => ({
                name: ward.name,
                patients: activeAdmissions.filter(item => item.ward === ward.name).length,
                occupancy: ward.capacity ? Math.round((Number(ward.occupied || 0) / Number(ward.capacity)) * 100) : 0
            }));

            const filteredDepartments = selectedDept === 'all'
                ? managementDepartments
                : managementDepartments.filter((department) => department.name.toLowerCase() === selectedDept.toLowerCase());

            const avgOccupancy = Math.round(filteredDepartments.reduce((sum, item) => sum + item.occupancy, 0) / Math.max(1, filteredDepartments.length));
            const totalPatients = filteredDepartments.reduce((sum, item) => sum + item.patients, 0);
            const today = new Date().toISOString().slice(0, 10);
            const operationsPulse = [
                { label: 'Admissions today', value: (seedData.admissions || []).filter(item => item.admissionDate === today).length },
                { label: 'Discharges today', value: (seedData.admissions || []).filter(item => item.dischargeDate === today).length },
                { label: 'Emergency appointments', value: (seedData.appointments || []).filter(item => item.date === today && String(item.department || '').toLowerCase().includes('emergency')).length },
                { label: 'Cancelled appointments', value: (seedData.appointments || []).filter(item => item.date === today && item.status === 'cancelled').length }
            ];
            const resourceLoad = [
                { name: 'Active doctors', value: (seedData.users || []).filter(item => item.role === 'doctor' && item.status === 'active').length },
                { name: 'Active nurses', value: (seedData.users || []).filter(item => item.role === 'nurse' && item.status === 'active').length },
                { name: 'Pending laboratory orders', value: (seedData.labOrders || []).filter(item => item.status !== 'completed').length },
                { name: 'Pending imaging orders', value: (seedData.radiologyOrders || []).filter(item => item.status !== 'reported').length }
            ];
            const logistics = [
                { title: 'Low-stock medicines', value: (seedData.pharmacyInventory || []).filter(item => Number(item.stockQuantity) <= Number(item.reorderLevel)).length },
                { title: 'Expiring inventory', value: (seedData.pharmacyInventory || []).filter(item => item.expiryDate && new Date(item.expiryDate) <= new Date(Date.now() + 30 * 86400000)).length },
                { title: 'Pending refill requests', value: 0 }
            ];

            const tabs = [
                { id: 'flow', label: 'Patient Flow' },
                { id: 'capacity', label: 'Capacity' },
                { id: 'logistics', label: 'Logistics' }
            ];

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Operations Command Centre</h2>
                            <p className="text-slate-500 mt-1">Hospital throughput, bed capacity, and service continuity</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Select
                                value={selectedDept}
                                onChange={(event) => setSelectedDept(event.target.value)}
                                options={[
                                    { value: 'all', label: 'All departments' },
                                    ...managementDepartments.map((dept) => ({ value: dept.name, label: dept.name }))
                                ]}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Active Patients" value={totalPatients} icon={Icons.Users} color="medical" />
                        <StatCard title="Active admissions" value={activeAdmissions.length} icon={Icons.Clock} color="amber" />
                        <StatCard title="Occupancy" value={`${avgOccupancy}%`} icon={Icons.Bed} color="emerald" />
                        <StatCard title="Open appointments" value={(seedData.appointments || []).filter(item => item.status === 'scheduled' || item.status === 'requested').length} icon={Icons.Activity} color="violet" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'flow' && (
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                            <Card title="Department Throughput" className="xl:col-span-2">
                                <div className="space-y-5">
                                    {filteredDepartments.map((department) => (
                                        <div key={department.name} className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <p className="font-semibold text-slate-900">{department.name}</p>
                                                    <p className="text-xs text-slate-500">{department.patients} active encounters</p>
                                                </div>
                                                <Badge variant={department.occupancy >= 90 ? 'danger' : department.occupancy >= 75 ? 'warning' : 'success'}>{department.occupancy}% occupied</Badge>
                                            </div>
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                                        <span>Occupancy</span>
                                                        <span>{department.occupancy}%</span>
                                                    </div>
                                                    <ProgressBar value={department.occupancy} max={100} color={department.occupancy >= 85 ? 'red' : 'emerald'} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card title="Live Operations Pulse">
                                <div className="space-y-4">
                                    {operationsPulse.map((metric) => (
                                        <div key={metric.label} className="rounded-xl border border-slate-200 p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-600">{metric.label}</span>
                                            </div>
                                            <p className="text-2xl font-bold text-slate-900 mt-2">{metric.value}</p>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'capacity' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Bed Utilization">
                                <BarChart
                                    data={managementDepartments.map(item => ({ label: item.name, value: item.occupancy }))}
                                    width={500}
                                    height={260}
                                    color="#2563eb"
                                />
                            </Card>

                            <Card title="Clinical Resource Load">
                                <div className="space-y-4">
                                    {resourceLoad.map((resource) => (
                                        <div key={resource.name}>
                                            <div className="flex items-center justify-between text-sm text-slate-600 mb-1">
                                                <span>{resource.name}</span>
                                                <span>{resource.value}</span>
                                            </div>
                                            <ProgressBar value={resource.value} max={Math.max(1, ...resourceLoad.map(item => item.value))} color="medical" />
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'logistics' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {logistics.map((item) => (
                                <Card key={item.title} title={item.title}>
                                    <div className="space-y-3">
                                        <Badge variant={item.value ? 'warning' : 'success'}>{item.value ? 'Review needed' : 'Clear'}</Badge>
                                        <p className="text-sm text-slate-600">{item.value} record{item.value === 1 ? '' : 's'} requiring attention.</p>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            );
        };

        // ==========================================
        // PROCUREMENT MODULE
        // ==========================================
        const ProcurementModule = () => {
            const [activeTab, setActiveTab] = useState('orders');
            const supplierPerformance = [];
            const monthlySpend = (seedData.billing || []).reduce((sum, bill) => sum + Number(bill.total || 0), 0);
            const openPurchaseOrders = 0;
            const pendingDeliveries = 0;
            const savings = 0;

            const tabs = [
                { id: 'orders', label: 'Purchase Orders' },
                { id: 'suppliers', label: 'Suppliers' },
                { id: 'analytics', label: 'Spend' }
            ];

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Procurement</h2>
                            <p className="text-slate-500 mt-1">Supplier management, purchase orders, and cost control</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus}>New Purchase</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Open POs" value={openPurchaseOrders} icon={Icons.Packages} color="medical" />
                        <StatCard title="Monthly Spend" value={formatCurrency(monthlySpend)} icon={Icons.DollarSign} color="emerald" />
                        <StatCard title="Late Deliveries" value={pendingDeliveries} icon={Icons.AlertCircle} color="amber" />
                        <StatCard title="Savings" value={formatCurrency(savings)} icon={Icons.CheckCircle} color="violet" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'orders' && (
                        <Card>
                            {openPurchaseOrders === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No purchase orders have been entered yet. Purchase activity will appear here once the purchasing workflow is live.</div>
                            ) : (
                                <DataTable
                                    columns={[
                                        { key: 'poNumber', title: 'PO #', className: 'font-mono text-xs' },
                                        { key: 'vendor', title: 'Vendor' },
                                        { key: 'category', title: 'Category' },
                                        { key: 'amount', title: 'Amount', render: (row) => formatCurrency(row.amount) },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'approved' ? 'success' : row.status === 'pending' ? 'warning' : 'danger'}>{row.status}</Badge> },
                                        { key: 'eta', title: 'ETA', render: (row) => formatDate(row.eta) }
                                    ]}
                                    data={[]}
                                />
                            )}
                        </Card>
                    )}

                    {activeTab === 'suppliers' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {supplierPerformance.length ? supplierPerformance.map((supplier) => (
                                <Card key={supplier.name} title={supplier.name}>
                                    <div className="space-y-4">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600">On-time delivery</span>
                                            <span className="font-semibold text-slate-900">{supplier.onTime}%</span>
                                        </div>
                                        <ProgressBar value={supplier.onTime} max={100} color={supplier.risk === 'High' ? 'red' : supplier.risk === 'Medium' ? 'amber' : 'emerald'} />
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600">Annual spend</span>
                                            <span className="font-semibold text-slate-900">{formatCurrency(supplier.spend)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600">Risk</span>
                                            <Badge variant={supplier.risk === 'High' ? 'danger' : supplier.risk === 'Medium' ? 'warning' : 'success'}>{supplier.risk}</Badge>
                                        </div>
                                    </div>
                                </Card>
                            )) : (
                                <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No supplier records are connected yet. Supplier performance will appear automatically once the inventory workflow is live.</div>
                            )}
                        </div>
                    )}

                    {activeTab === 'analytics' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Monthly Spend Trend">
                                <BarChart
                                    data={[]}
                                    width={500}
                                    height={260}
                                    color="#10b981"
                                />
                            </Card>
                            <Card title="Category Spend">
                                <div className="space-y-4">
                                    {monthlySpend > 0 ? (
                                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Live spend data is now being calculated from the connected billing records.</div>
                                    ) : (
                                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No spend data is available yet. Once billing records are created, this chart will populate automatically.</div>
                                    )}
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            );
        };

        // ==========================================
        // CARE COORDINATION / REFERRALS MODULE
        // ==========================================
        const CareCoordinationModule = () => {
            const [activeTab, setActiveTab] = useState('referrals');

            const referralQueue = [];

            const tabs = [
                { id: 'referrals', label: 'Referrals' },
                { id: 'followups', label: 'Follow-ups' },
                { id: 'handoffs', label: 'Handoffs' }
            ];

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Referrals & Care Coordination</h2>
                            <p className="text-slate-500 mt-1">Track specialty referrals, continuity of care, and patient handoff readiness</p>
                        </div>
                        <Button variant="primary" icon={Icons.UserPlus}>Create Referral</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Open Referrals" value={referralQueue.length} icon={Icons.UserCheck} color="medical" />
                        <StatCard title="High Risk" value={referralQueue.filter((item) => item.risk === 'High').length} icon={Icons.AlertCircle} color="red" />
                        <StatCard title="Accepted" value={referralQueue.filter((item) => item.status === 'Accepted').length} icon={Icons.CheckCircle} color="emerald" />
                        <StatCard title="Follow-ups" value={0} icon={Icons.Calendar} color="violet" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'referrals' && (
                        <Card>
                            {referralQueue.length ? (
                                <DataTable
                                    columns={[
                                        { key: 'id', title: 'Referral ID', className: 'font-mono text-xs' },
                                        { key: 'patient', title: 'Patient' },
                                        { key: 'specialty', title: 'Specialty' },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'Accepted' ? 'success' : row.status === 'Pending' ? 'warning' : row.status === 'In progress' ? 'info' : 'default'}>{row.status}</Badge> },
                                        { key: 'risk', title: 'Risk', render: (row) => <Badge variant={row.risk === 'High' ? 'danger' : row.risk === 'Moderate' ? 'warning' : 'success'}>{row.risk}</Badge> },
                                        { key: 'due', title: 'Due' }
                                    ]}
                                    data={referralQueue}
                                    actions={(row) => (
                                        <Button variant="primary" size="sm">Review</Button>
                                    )}
                                />
                            ) : (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No referrals have been created yet. Referral activity will appear here once the care coordination workflow is active.</div>
                            )}
                        </Card>
                    )}

                    {activeTab === 'followups' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Follow-up Schedule">
                                <div className="space-y-3">
                                    {[
                                        { title: 'Cardiac rehab review', due: 'Tomorrow', owner: 'Nurse case manager' },
                                        { title: 'Post-op wound review', due: 'In 2 days', owner: 'Surgical clinic' },
                                        { title: 'Medication reconciliation', due: 'This week', owner: 'Pharmacy' }
                                    ].map((item) => (
                                        <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-slate-800">{item.title}</span>
                                                <Badge variant="info">{item.due}</Badge>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-2">Owner: {item.owner}</p>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card title="Care Pathway Completion">
                                <div className="space-y-4">
                                    {[
                                        { label: 'Discharge plan', value: 94 },
                                        { label: 'Medication education', value: 89 },
                                        { label: 'Primary care handoff', value: 92 },
                                        { label: 'Community follow-up', value: 81 }
                                    ].map((item) => (
                                        <div key={item.label}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-slate-600">{item.label}</span>
                                                <span className="font-medium text-slate-900">{item.value}%</span>
                                            </div>
                                            <ProgressBar value={item.value} max={100} color="emerald" />
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'handoffs' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {[
                                { title: 'Primary Care', detail: 'Clinician summary shared and signed', tone: 'success' },
                                { title: 'Specialty Team', detail: 'Pending imaging results upload', tone: 'warning' },
                                { title: 'Community Service', detail: 'Home care checklist awaiting confirmation', tone: 'info' }
                            ].map((item) => (
                                <Card key={item.title} title={item.title}>
                                    <div className="space-y-3">
                                        <Badge variant={item.tone === 'success' ? 'success' : item.tone === 'warning' ? 'warning' : 'info'}>{item.tone === 'success' ? 'Complete' : item.tone === 'warning' ? 'Pending' : 'Queued'}</Badge>
                                        <p className="text-sm text-slate-600">{item.detail}</p>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            );
        };

        // ==========================================
        // WORKFORCE ANALYTICS MODULE
        // ==========================================
        const WorkforceModule = () => {
            const staffingCoverage = (seedData.users || []).length
                ? [
                    { unit: 'Clinical Teams', scheduled: (seedData.users || []).length, actual: (seedData.users || []).filter((user) => user.status === 'active').length, occupancy: Math.min(100, Math.round(((seedData.users || []).filter((user) => user.status === 'active').length / Math.max(1, (seedData.users || []).length)) * 100)) }
                ]
                : [];

            const productivity = [];

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Workforce Analytics</h2>
                            <p className="text-slate-500 mt-1">Staffing coverage, productivity, and leave-risk monitoring</p>
                        </div>
                        <Button variant="primary" icon={Icons.UserPlus}>Manage Roster</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Coverage" value={(staffingCoverage[0]?.occupancy || 0) + '%'} icon={Icons.Users} color="medical" />
                        <StatCard title="Productivity" value="0%" icon={Icons.Activity} color="emerald" />
                        <StatCard title="Leave Risk" value={0} icon={Icons.Calendar} color="amber" />
                        <StatCard title="Vacancies" value={0} icon={Icons.AlertCircle} color="red" />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <Card title="Unit Coverage" className="xl:col-span-2">
                            <div className="space-y-5">
                                {staffingCoverage.length ? staffingCoverage.map((unit) => (
                                    <div key={unit.unit} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="font-semibold text-slate-900">{unit.unit}</span>
                                            <span className="text-sm text-slate-500">{unit.actual}/{unit.scheduled}</span>
                                        </div>
                                        <ProgressBar value={Math.round((unit.actual / unit.scheduled) * 100)} max={100} color={unit.occupancy >= 80 ? 'amber' : 'emerald'} />
                                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                                            <span>Unit load {unit.occupancy}%</span>
                                            <Badge variant={unit.actual / unit.scheduled >= 0.9 ? 'success' : 'warning'}>{unit.actual / unit.scheduled >= 0.9 ? 'Stable' : 'Watch'}</Badge>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No staff records are connected yet. Workforce analytics will populate after staff profiles are created in Supabase.</div>
                                )}
                            </div>
                        </Card>

                        <Card title="Productivity by Team">
                            <div className="space-y-4">
                                {productivity.length ? productivity.map((team) => (
                                    <div key={team.label}>
                                        <div className="flex items-center justify-between text-sm mb-1">
                                            <span className="text-slate-600">{team.label}</span>
                                            <span className="font-medium text-slate-900">{team.value}%</span>
                                        </div>
                                        <ProgressBar value={team.value} max={100} color={team.value >= 85 ? 'emerald' : 'amber'} />
                                    </div>
                                )) : (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No productivity data is available until live staff activity is recorded.</div>
                                )}
                            </div>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card title="Staffing Risks">
                            <div className="space-y-3">
                                {[
                                    { name: 'Nurse shortage', detail: '3 night shifts uncovered this week', tone: 'warning' },
                                    { name: 'Provider coverage', detail: 'One consultant on leave next 3 days', tone: 'info' },
                                    { name: 'Lab bench strain', detail: 'Peak demand likely over 48h', tone: 'amber' }
                                ].map((risk) => (
                                    <div key={risk.name} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-slate-800">{risk.name}</span>
                                            <Badge variant={risk.tone === 'warning' ? 'warning' : 'info'}>{risk.tone === 'warning' ? 'Watch' : 'Note'}</Badge>
                                        </div>
                                        <p className="mt-2 text-sm text-slate-600">{risk.detail}</p>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card title="Roster Status">
                            <div className="space-y-3">
                                {[
                                    { label: 'Certified staff on shift', value: '96%' },
                                    { label: 'Training compliance', value: '88%' },
                                    { label: 'Overtime requested', value: '13 staff' },
                                    { label: 'Next review date', value: '2026-09-07' }
                                ].map((item) => (
                                    <div key={item.label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <span className="text-sm text-slate-600">{item.label}</span>
                                        <span className="text-sm font-semibold text-slate-900">{item.value}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                </div>
            );
        };

        // ==========================================
        // PHARMACY MODULE
        // ==========================================
        const PharmacyModule = () => {
            const [activeTab, setActiveTab] = useState('dispensary');
            const [searchQuery, setSearchQuery] = useState('');
            const [inventory, setInventory] = useState(hydrateSeedData().pharmacyInventory || []);
            const [showAddStock, setShowAddStock] = useState(false);
            const [stockForm, setStockForm] = useState({ name: '', genericName: '', category: 'General', stockQuantity: 0, reorderLevel: 0, unitPrice: 0, expiryDate: '', supplier: '' });

            const filteredDrugs = (inventory || []).filter(d => 
                (d.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (d.category || '').toLowerCase().includes(searchQuery.toLowerCase())
            );

            const tabs = [
                { id: 'dispensary', label: 'Dispensary' },
                { id: 'inventory', label: 'Inventory' },
                { id: 'prescriptions', label: 'Prescriptions' },
                { id: 'purchase', label: 'Purchase Orders' },
            ];

            const handleAddStock = async () => {
                if (!stockForm.name) return;
                const payload = {
                    id: 'med_' + Date.now(),
                    name: stockForm.name,
                    genericName: stockForm.genericName,
                    category: stockForm.category,
                    stockQuantity: Number(stockForm.stockQuantity || 0),
                    reorderLevel: Number(stockForm.reorderLevel || 0),
                    unitPrice: Number(stockForm.unitPrice || 0),
                    expiryDate: stockForm.expiryDate,
                    supplier: stockForm.supplier,
                    status: Number(stockForm.stockQuantity) <= Number(stockForm.reorderLevel) ? 'low_stock' : 'active'
                };

                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('add inventory');
                const { data, error } = await client.from('pharmacy_inventory').insert([{ ...payload, generic_name: payload.genericName, stock_quantity: payload.stockQuantity, reorder_level: payload.reorderLevel, unit_price: payload.unitPrice, expiry_date: payload.expiryDate }]).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('add inventory', error);
                const mapped = { ...payload, id: data[0].id, genericName: data[0].generic_name || payload.genericName, stockQuantity: data[0].stock_quantity ?? payload.stockQuantity, reorderLevel: data[0].reorder_level ?? payload.reorderLevel, unitPrice: data[0].unit_price ?? payload.unitPrice, expiryDate: data[0].expiry_date || payload.expiryDate };
                const next = [...inventory, mapped];
                persistSeedTable('pharmacyInventory', next);
                setInventory(next);
                setShowAddStock(false);
                setStockForm({ name: '', genericName: '', category: 'General', stockQuantity: 10, reorderLevel: 5, unitPrice: 20, expiryDate: '', supplier: '' });
            };

            const handleDispense = async (prescription) => {
                const client = window.MedicoreSupabase?.getClient?.();
                const updatedPrescription = { ...prescription, status: 'dispensed' };
                if (!client) return notifyPersistenceFailure('dispense medication');
                const medication = prescription.medications?.[0];
                const stockItem = medication && inventory.find((item) => item.name === medication.name);
                if (!stockItem) return notifyPersistenceFailure('dispense medication', new Error('No matching inventory item was found.'));
                const quantity = Number(medication.quantity || 1);
                const remainingStock = Number(stockItem.stockQuantity || 0) - quantity;
                if (remainingStock < 0) return notifyPersistenceFailure('dispense medication', new Error('Insufficient stock.'));
                const { error: inventoryError } = await client.from('pharmacy_inventory').update({ stock_quantity: remainingStock }).eq('id', stockItem.id);
                if (inventoryError) return notifyPersistenceFailure('dispense medication', inventoryError);
                const { error } = await client.from('prescriptions').update({ status: 'dispensed' }).eq('id', prescription.id);
                if (error) return notifyPersistenceFailure('dispense medication', error);

                const nextInventory = inventory.map((item) => {
                    if (item.id === stockItem.id) {
                        return { ...item, stockQuantity: remainingStock };
                    }
                    return item;
                });

                persistSeedTable('pharmacyInventory', nextInventory);
                setInventory(nextInventory);
                const nextPrescriptions = (seedData.prescriptions || []).map((item) => item.id === prescription.id ? updatedPrescription : item);
                persistSeedTable('prescriptions', nextPrescriptions);
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Pharmacy</h2>
                            <p className="text-slate-500 mt-1">Medication dispensing and inventory</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" icon={Icons.ScanLine}>Scan Barcode</Button>
                            <Button variant="primary" icon={Icons.Plus} onClick={() => setShowAddStock(true)}>Add Stock</Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Total Items" value={inventory.length} icon={Icons.Package} color="medical" />
                        <StatCard title="Low Stock" value={inventory.filter(d => Number(d.stockQuantity || 0) <= Number(d.reorderLevel || 0)).length} icon={Icons.AlertCircle} color="amber" />
                        <StatCard title="Expiring Soon" value={inventory.filter(d => {
                            const expiry = new Date(d.expiryDate);
                            const threeMonths = new Date();
                            threeMonths.setMonth(threeMonths.getMonth() + 3);
                            return expiry <= threeMonths;
                        }).length} icon={Icons.Clock} color="red" />
                        <StatCard title="Inventory Value" value={formatCurrency(inventory.reduce((sum, item) => sum + (Number(item.unitPrice || 0) * Number(item.stockQuantity || 0)), 0))} icon={Icons.DollarSign} color="emerald" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'dispensary' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card title="Pending Prescriptions" className="lg:col-span-2">
                                <DataTable
                                    columns={[
                                        { key: 'id', title: 'Rx ID', className: 'font-mono text-xs' },
                                        { key: 'patient', title: 'Patient', render: (row) => {
                                            const patient = seedData.patients.find(p => p.id === row.patientId);
                                            return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                        }},
                                        { key: 'diagnosis', title: 'Diagnosis' },
                                        { key: 'medications', title: 'Items', render: (row) => row.medications.length },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge> }
                                    ]}
                                    data={seedData.prescriptions.filter(p => p.status === 'active')}
                                    actions={(row) => (
                                        <Button variant="primary" size="sm" icon={Icons.Check} onClick={() => handleDispense(row)}>Dispense</Button>
                                    )}
                                />
                            </Card>
                            <Card title="Quick Dispense">
                                <div className="space-y-4">
                                    <SearchBar placeholder="Search medication..." />
                                    <div className="space-y-2">
                                        {inventory.slice(0, 5).map(drug => (
                                            <div key={drug.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-900">{drug.name}</p>
                                                    <p className="text-xs text-slate-500">{drug.category} - Stock: {drug.stockQuantity}</p>
                                                </div>
                                                <Button variant="ghost" size="sm" icon={Icons.Plus} onClick={() => setShowAddStock(true)} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'inventory' && (
                        <Card>
                            <div className="mb-4">
                                <SearchBar
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search drugs by name or category..."
                                />
                            </div>
                            <DataTable
                                columns={[
                                    { key: 'name', title: 'Drug Name' },
                                    { key: 'genericName', title: 'Generic Name' },
                                    { key: 'category', title: 'Category' },
                                    { key: 'stockQuantity', title: 'Stock', render: (row) => (
                                        <div className="flex items-center gap-2">
                                            <span className={row.stockQuantity < row.reorderLevel ? 'text-red-600 font-medium' : ''}>{row.stockQuantity}</span>
                                            {row.stockQuantity < row.reorderLevel && <Badge variant="danger">Low</Badge>}
                                        </div>
                                    )},
                                    { key: 'unitPrice', title: 'Price', render: (row) => formatCurrency(row.unitPrice) },
                                    { key: 'expiryDate', title: 'Expiry', render: (row) => {
                                        const expiry = new Date(row.expiryDate);
                                        const today = new Date();
                                        const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                                        return (
                                            <span className={diff < 90 ? 'text-red-600 font-medium' : diff < 180 ? 'text-amber-600' : 'text-slate-600'}>
                                                {formatDate(row.expiryDate)}
                                            </span>
                                        );
                                    }},
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'low_stock' ? 'warning' : row.status === 'expired' ? 'danger' : 'success'}>{row.status}</Badge> }
                                ]}
                                data={filteredDrugs}
                                actions={(row) => (
                                    <>
                                        <Button variant="ghost" size="sm" icon={Icons.Edit} />
                                    </>
                                )}
                            />
                        </Card>
                    )}

                    {activeTab === 'prescriptions' && (
                        <Card>
                            <DataTable
                                columns={[
                                    { key: 'id', title: 'Rx ID' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'doctor', title: 'Doctor', render: (row) => {
                                        const doctor = seedData.users.find(u => u.id === row.doctorId);
                                        return doctor?.name || 'Unknown';
                                    }},
                                    { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                    { key: 'diagnosis', title: 'Diagnosis' },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : row.status === 'dispensed' ? 'info' : 'default'}>{row.status}</Badge> }
                                ]}
                                data={seedData.prescriptions}
                            />
                        </Card>
                    )}

                    {activeTab === 'purchase' && (
                        <Card title="Purchase Orders">
                            <div className="text-center py-12">
                                <Icons.ShoppingCart size={48} className="mx-auto text-slate-300 mb-4" />
                                <p className="text-slate-500">No active purchase orders</p>
                                <Button variant="primary" icon={Icons.Plus} className="mt-4" onClick={() => setShowAddStock(true)}>Create PO</Button>
                            </div>
                        </Card>
                    )}

                    <Modal
                        isOpen={showAddStock}
                        onClose={() => setShowAddStock(false)}
                        title="Add Medical Stock"
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowAddStock(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleAddStock}>Save Stock</Button>
                            </div>
                        }
                    >
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="Drug Name" value={stockForm.name} onChange={(e) => setStockForm(prev => ({ ...prev, name: e.target.value }))} className="col-span-2" />
                            <Input label="Generic Name" value={stockForm.genericName} onChange={(e) => setStockForm(prev => ({ ...prev, genericName: e.target.value }))} className="col-span-2" />
                            <Input label="Category" value={stockForm.category} onChange={(e) => setStockForm(prev => ({ ...prev, category: e.target.value }))} />
                            <Input label="Stock Qty" type="number" value={stockForm.stockQuantity} onChange={(e) => setStockForm(prev => ({ ...prev, stockQuantity: e.target.value }))} />
                            <Input label="Reorder Level" type="number" value={stockForm.reorderLevel} onChange={(e) => setStockForm(prev => ({ ...prev, reorderLevel: e.target.value }))} />
                            <Input label="Unit Price" type="number" value={stockForm.unitPrice} onChange={(e) => setStockForm(prev => ({ ...prev, unitPrice: e.target.value }))} />
                            <Input label="Expiry Date" type="date" value={stockForm.expiryDate} onChange={(e) => setStockForm(prev => ({ ...prev, expiryDate: e.target.value }))} />
                            <Input label="Supplier" value={stockForm.supplier} onChange={(e) => setStockForm(prev => ({ ...prev, supplier: e.target.value }))} className="col-span-2" />
                        </div>
                    </Modal>
                </div>
            );
        };

        // ==========================================
        // BILLING MODULE
        // ==========================================
        const BillingModule = ({ initialTab = 'invoices' }) => {
            const [activeTab, setActiveTab] = useState(initialTab);
            const [selectedInvoice, setSelectedInvoice] = useState(null);
            const [showNewInvoice, setShowNewInvoice] = useState(false);
            const [showPaymentModal, setShowPaymentModal] = useState(false);
            const [showInsuranceModal, setShowInsuranceModal] = useState(false);
            const [invoices, setInvoices] = useState(hydrateSeedData().billing || []);
            const [insuranceFilter, setInsuranceFilter] = useState('all');
            const [invoiceForm, setInvoiceForm] = useState({ patientId: '', invoiceNumber: 'INV-' + Date.now(), total: 250, paid: 0, status: 'pending' });
            const [paymentForm, setPaymentForm] = useState({ invoiceId: '', amount: 0, method: 'Card', reference: '' });
            const [claimForm, setClaimForm] = useState({ patientId: '', provider: '', claimNumber: 'CLM-' + Date.now(), amountClaimed: 0, amountApproved: 0, status: 'pending' });

            useEffect(() => {
                setActiveTab(initialTab);
            }, [initialTab]);

            const tabs = [
                { id: 'invoices', label: 'Invoices' },
                { id: 'payments', label: 'Payments' },
                { id: 'insurance', label: 'Insurance Claims' },
                { id: 'reports', label: 'Financial Reports' },
            ];

            const handleCreateInvoice = async () => {
                if (!invoiceForm.patientId) return;
                const payload = {
                    id: 'inv_' + Date.now(),
                    patientId: invoiceForm.patientId,
                    invoiceNumber: invoiceForm.invoiceNumber || 'INV-' + Date.now(),
                    date: new Date().toISOString().split('T')[0],
                    subtotal: Number(invoiceForm.total || 0),
                    discount: 0,
                    tax: 0,
                    total: Number(invoiceForm.total || 0),
                    paid: Number(invoiceForm.paid || 0),
                    balance: Math.max(0, Number(invoiceForm.total || 0) - Number(invoiceForm.paid || 0)),
                    paymentMethod: 'cash',
                    status: Number(invoiceForm.paid || 0) >= Number(invoiceForm.total || 0) ? 'paid' : 'pending'
                };

                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('create invoice');
                const { data, error } = await client.from('billing').insert([{ ...payload, patient_id: payload.patientId, invoice_number: payload.invoiceNumber, invoice_date: payload.date, subtotal: payload.subtotal, tax: payload.tax, total: payload.total, paid: payload.paid, balance: payload.balance, payment_method: payload.paymentMethod, status: payload.status }]).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('create invoice', error);
                const mapped = { ...payload, id: data[0].id, patientId: data[0].patient_id || payload.patientId, invoiceNumber: data[0].invoice_number || payload.invoiceNumber, date: data[0].invoice_date || payload.date, paymentMethod: data[0].payment_method || payload.paymentMethod };
                const next = [...invoices, mapped];
                persistSeedTable('billing', next);
                setInvoices(next);
                setShowNewInvoice(false);
                setInvoiceForm({ patientId: '', invoiceNumber: 'INV-' + Date.now(), total: 0, paid: 0, status: 'pending' });
            };

            const handleProcessPayment = async () => {
                if (!paymentForm.invoiceId || !Number(paymentForm.amount || 0)) return;
                const updated = invoices.map((invoice) => {
                    if (invoice.id !== paymentForm.invoiceId) return invoice;
                    const paidNow = Number(invoice.paid || 0) + Number(paymentForm.amount || 0);
                    const total = Number(invoice.total || 0);
                    const balance = Math.max(0, total - paidNow);
                    const status = paidNow >= total ? 'paid' : balance > 0 ? 'partial' : 'paid';
                    return { ...invoice, paid: paidNow, balance, status, paymentMethod: paymentForm.method || invoice.paymentMethod };
                });
                const changed = updated.find(invoice => invoice.id === paymentForm.invoiceId);
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client || !changed) return notifyPersistenceFailure('process payment');
                const { error } = await client.from('billing').update({ paid: changed.paid, balance: changed.balance, status: changed.status, payment_method: changed.paymentMethod }).eq('id', changed.id);
                if (error) return notifyPersistenceFailure('process payment', error);
                persistSeedTable('billing', updated);
                setInvoices(updated);
                setShowPaymentModal(false);
                setPaymentForm({ invoiceId: '', amount: 0, method: 'Card', reference: '' });
            };

            const handleAdvanceClaim = async (claimId) => {
                const queue = ['pending', 'under_review', 'approved', 'paid'];
                const nextClaims = (seedData.insuranceClaims || []).map((claim) => {
                    if (claim.id !== claimId) return claim;
                    const currentIndex = queue.indexOf(claim.status || 'pending');
                    const nextStatus = queue[Math.min(queue.length - 1, currentIndex + 1)] || 'pending';
                    return { ...claim, status: nextStatus, amountApproved: Number(claim.amountApproved || 0) || Number(claim.amountClaimed || 0) };
                });
                const changed = nextClaims.find(claim => claim.id === claimId);
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client || !changed) return notifyPersistenceFailure('advance insurance claim');
                const { error } = await client.from('insurance_claims').update({ status: changed.status, amount_approved: changed.amountApproved }).eq('id', claimId);
                if (error) return notifyPersistenceFailure('advance insurance claim', error);
                persistSeedTable('insuranceClaims', nextClaims);
                seedData.insuranceClaims = nextClaims;
            };

            const handleSubmitInsuranceClaim = async () => {
                if (!claimForm.patientId) return;
                const nextClaim = {
                    id: 'claim_' + Date.now(),
                    patientId: claimForm.patientId,
                    claimNumber: claimForm.claimNumber || 'CLM-' + Date.now(),
                    provider: claimForm.provider,
                    amountClaimed: Number(claimForm.amountClaimed || 0),
                    amountApproved: Number(claimForm.amountApproved || 0),
                    status: Number(claimForm.amountApproved || 0) > 0 ? 'under_review' : 'pending'
                };
                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('submit insurance claim');
                const { data, error } = await client.from('insurance_claims').insert({ patient_id: nextClaim.patientId, claim_number: nextClaim.claimNumber, provider: nextClaim.provider, amount_claimed: nextClaim.amountClaimed, amount_approved: nextClaim.amountApproved, status: nextClaim.status }).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('submit insurance claim', error);
                const savedClaim = normalizeInsuranceClaims(data)[0];
                const next = [...(seedData.insuranceClaims || []), savedClaim];
                persistSeedTable('insuranceClaims', next);
                seedData.insuranceClaims = next;
                setShowInsuranceModal(false);
                setClaimForm({ patientId: '', provider: '', claimNumber: 'CLM-' + Date.now(), amountClaimed: 0, amountApproved: 0, status: 'pending' });
            };

            const totalRevenue = invoices.reduce((s, b) => s + parseFloat(b.total || 0), 0);
            const totalCollected = invoices.reduce((s, b) => s + parseFloat(b.paid || 0), 0);
            const totalOutstanding = invoices.reduce((s, b) => s + parseFloat(b.balance || 0), 0);
            const insuranceClaims = seedData.insuranceClaims || [];
            const pendingClaims = insuranceClaims.filter(c => c.status === 'pending' || c.status === 'under_review').length;
            const approvedClaims = insuranceClaims.filter(c => c.status === 'approved' || c.status === 'paid').length;
            const deniedClaims = insuranceClaims.filter(c => c.status === 'denied').length;
            const claimApprovalRate = insuranceClaims.length ? Math.round((approvedClaims / insuranceClaims.length) * 100) : 0;
            const allowedInsurance = insuranceClaims.reduce((s, claim) => s + Number(claim.amountApproved || 0), 0);
            const agingSummary = [
                { label: 'Current', value: invoices.filter(i => Number(i.balance || 0) <= 30).length },
                { label: '31-60 days', value: invoices.filter(i => Number(i.balance || 0) > 30 && Number(i.balance || 0) <= 60).length },
                { label: '61-90 days', value: invoices.filter(i => Number(i.balance || 0) > 60 && Number(i.balance || 0) <= 90).length },
                { label: '90+ days', value: invoices.filter(i => Number(i.balance || 0) > 90).length }
            ];

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Billing</h2>
                            <p className="text-slate-500 mt-1">Invoices, payments, and insurance workflows</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => setShowInsuranceModal(true)}>New Claim</Button>
                            <Button variant="primary" icon={Icons.Plus} onClick={() => setShowNewInvoice(true)}>Create Invoice</Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} icon={Icons.DollarSign} color="emerald" />
                        <StatCard title="Outstanding" value={formatCurrency(totalOutstanding)} icon={Icons.AlertCircle} color="amber" />
                        <StatCard title="Collected" value={formatCurrency(totalCollected)} icon={Icons.CheckCircle} color="medical" />
                        <StatCard title="Pending Claims" value={pendingClaims} icon={Icons.Shield} color="violet" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'invoices' && (
                        <Card>
                            <DataTable
                                columns={[
                                    { key: 'invoiceNumber', title: 'Invoice', className: 'font-mono text-xs' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                    { key: 'total', title: 'Total', render: (row) => formatCurrency(row.total) },
                                    { key: 'paid', title: 'Paid', render: (row) => formatCurrency(row.paid) },
                                    { key: 'balance', title: 'Balance', render: (row) => <span className={parseFloat(row.balance) > 0 ? 'text-red-600 font-medium' : 'text-emerald-600'}>{formatCurrency(row.balance)}</span> },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'paid' ? 'success' : row.status === 'partial' ? 'warning' : row.status === 'overdue' ? 'danger' : 'default'}>{row.status}</Badge> }
                                ]}
                                data={invoices}
                                actions={(row) => (
                                    <>
                                        <Button variant="primary" size="sm" onClick={() => setSelectedInvoice(row)}>View</Button>
                                        <Button variant="secondary" size="sm" onClick={() => { setPaymentForm({ invoiceId: row.id, amount: Math.max(0, Number(row.balance || 0)), method: 'Card', reference: '' }); setShowPaymentModal(true); }}>Post Payment</Button>
                                    </>
                                )}
                            />
                        </Card>
                    )}

                    {activeTab === 'payments' && (
                        <Card title="Recent Payments">
                            <DataTable
                                columns={[
                                    { key: 'invoiceNumber', title: 'Invoice' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'paid', title: 'Amount', render: (row) => formatCurrency(row.paid) },
                                    { key: 'paymentMethod', title: 'Method' },
                                    { key: 'date', title: 'Date', render: (row) => formatDate(row.date) }
                                ]}
                                data={invoices.filter(b => parseFloat(b.paid || 0) > 0)}
                            />
                        </Card>
                    )}

                    {activeTab === 'insurance' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="rounded-2xl border border-medical-200 bg-medical-50 p-4">
                                    <p className="text-xs uppercase tracking-wide text-medical-600">Approval rate</p>
                                    <p className="mt-2 text-2xl font-bold text-medical-900">{claimApprovalRate}%</p>
                                </div>
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                                    <p className="text-xs uppercase tracking-wide text-emerald-600">Approved</p>
                                    <p className="mt-2 text-2xl font-bold text-emerald-900">{approvedClaims}</p>
                                </div>
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                    <p className="text-xs uppercase tracking-wide text-amber-600">Pending</p>
                                    <p className="mt-2 text-2xl font-bold text-amber-900">{pendingClaims}</p>
                                </div>
                                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                                    <p className="text-xs uppercase tracking-wide text-red-600">Denied</p>
                                    <p className="mt-2 text-2xl font-bold text-red-900">{deniedClaims}</p>
                                </div>
                            </div>

                            <Card title="Claims queue">
                                <div className="mb-4 flex flex-wrap gap-2">
                                    {['all', 'pending', 'under_review', 'approved', 'paid', 'denied'].map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => setInsuranceFilter(status)}
                                            className={'rounded-full px-3 py-1.5 text-xs font-medium transition ' + (insuranceFilter === status ? 'bg-medical-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
                                        >
                                            {status === 'all' ? 'All' : status.replace('_', ' ')}
                                        </button>
                                    ))}
                                </div>
                                <DataTable
                                    columns={[
                                        { key: 'claimNumber', title: 'Claim #' },
                                        { key: 'patient', title: 'Patient', render: (row) => {
                                            const patient = seedData.patients.find(p => p.id === row.patientId);
                                            return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                        }},
                                        { key: 'provider', title: 'Provider' },
                                        { key: 'amountClaimed', title: 'Claimed', render: (row) => formatCurrency(row.amountClaimed) },
                                        { key: 'amountApproved', title: 'Approved', render: (row) => formatCurrency(row.amountApproved) },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'approved' || row.status === 'paid' ? 'success' : row.status === 'denied' ? 'danger' : 'warning'}>{row.status}</Badge> }
                                    ]}
                                    data={(insuranceClaims || []).filter((claim) => insuranceFilter === 'all' || claim.status === insuranceFilter)}
                                    actions={(row) => (
                                        <Button variant="secondary" size="sm" onClick={() => handleAdvanceClaim(row.id)}>Advance</Button>
                                    )}
                                />
                            </Card>
                        </div>
                    )}

                    {activeTab === 'reports' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Revenue by Department">
                                <BarChart
                                    data={[
                                        { label: 'Consult', value: 35000 },
                                        { label: 'Lab', value: 28000 },
                                        { label: 'Radio', value: 22000 },
                                        { label: 'Pharm', value: 18000 },
                                        { label: 'Surgery', value: 45000 }
                                    ]}
                                    width={500}
                                    height={250}
                                    color="#2563eb"
                                />
                            </Card>
                            <Card title="Payment Summary">
                                <div className="space-y-4">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-700">Invoices</span>
                                        <span className="font-medium text-slate-900">{invoices.length}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-700">Collected</span>
                                        <span className="font-medium text-slate-900">{formatCurrency(totalCollected)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-700">Outstanding</span>
                                        <span className="font-medium text-slate-900">{formatCurrency(totalOutstanding)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-700">Insurance approved</span>
                                        <span className="font-medium text-slate-900">{formatCurrency(allowedInsurance)}</span>
                                    </div>
                                </div>
                            </Card>
                            <Card title="Aging summary" className="lg:col-span-2">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {agingSummary.map((bucket) => (
                                        <div key={bucket.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">{bucket.label}</p>
                                            <p className="mt-2 text-2xl font-bold text-slate-900">{bucket.value}</p>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}

                    <Modal
                        isOpen={showNewInvoice}
                        onClose={() => setShowNewInvoice(false)}
                        title="Create Invoice"
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowNewInvoice(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleCreateInvoice}>Save Invoice</Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <Select label="Patient" value={invoiceForm.patientId} onChange={(e) => setInvoiceForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(hydrateSeedData().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Input label="Invoice Number" value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm(prev => ({ ...prev, invoiceNumber: e.target.value }))} />
                            <Input label="Total Amount" type="number" value={invoiceForm.total} onChange={(e) => setInvoiceForm(prev => ({ ...prev, total: e.target.value }))} />
                            <Input label="Amount Paid" type="number" value={invoiceForm.paid} onChange={(e) => setInvoiceForm(prev => ({ ...prev, paid: e.target.value }))} />
                        </div>
                    </Modal>

                    <Modal
                        isOpen={showPaymentModal}
                        onClose={() => setShowPaymentModal(false)}
                        title="Post payment"
                        size="sm"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowPaymentModal(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.CheckCircle} onClick={handleProcessPayment}>Save payment</Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <Select label="Payment method" value={paymentForm.method} onChange={(e) => setPaymentForm(prev => ({ ...prev, method: e.target.value }))} options={[{ value: 'Card', label: 'Card' }, { value: 'Cash', label: 'Cash' }, { value: 'Bank Transfer', label: 'Bank Transfer' }, { value: 'Insurance', label: 'Insurance' }]} />
                            <Input label="Amount" type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))} />
                            <Input label="Reference" value={paymentForm.reference} onChange={(e) => setPaymentForm(prev => ({ ...prev, reference: e.target.value }))} />
                        </div>
                    </Modal>

                    <Modal
                        isOpen={showInsuranceModal}
                        onClose={() => setShowInsuranceModal(false)}
                        title="Add insurance claim"
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowInsuranceModal(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Shield} onClick={handleSubmitInsuranceClaim}>Submit claim</Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <Select label="Patient" value={claimForm.patientId} onChange={(e) => setClaimForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(hydrateSeedData().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Input label="Provider" value={claimForm.provider} onChange={(e) => setClaimForm(prev => ({ ...prev, provider: e.target.value }))} />
                            <Input label="Claim Number" value={claimForm.claimNumber} onChange={(e) => setClaimForm(prev => ({ ...prev, claimNumber: e.target.value }))} />
                            <Input label="Amount Claimed" type="number" value={claimForm.amountClaimed} onChange={(e) => setClaimForm(prev => ({ ...prev, amountClaimed: e.target.value }))} />
                            <Input label="Amount Approved" type="number" value={claimForm.amountApproved} onChange={(e) => setClaimForm(prev => ({ ...prev, amountApproved: e.target.value }))} />
                        </div>
                    </Modal>

                    <Modal
                        isOpen={!!selectedInvoice}
                        onClose={() => setSelectedInvoice(null)}
                        title={'Invoice ' + (selectedInvoice?.invoiceNumber || '')}
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="secondary" icon={Icons.Printer}>Print</Button>
                                <Button variant="primary" icon={Icons.Download}>Download PDF</Button>
                            </div>
                        }
                    >
                        {selectedInvoice && (
                            <div className="space-y-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Date:</span>
                                    <span className="font-medium">{formatDate(selectedInvoice.date)}</span>
                                </div>
                                <div className="border-t border-slate-100 pt-4">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-slate-500 border-b border-slate-100">
                                                <th className="pb-2">Item</th>
                                                <th className="pb-2 text-right">Qty</th>
                                                <th className="pb-2 text-right">Price</th>
                                                <th className="pb-2 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedInvoice.items ? selectedInvoice.items.map((item, i) => (
                                                <tr key={i} className="border-b border-slate-50">
                                                    <td className="py-2">{item.description}</td>
                                                    <td className="py-2 text-right">{item.quantity}</td>
                                                    <td className="py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                                                    <td className="py-2 text-right font-medium">{formatCurrency(item.total)}</td>
                                                </tr>
                                            )) : <tr><td className="py-2 text-slate-500" colSpan="4">No line items</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between"><span className="text-slate-500">Subtotal:</span><span>{formatCurrency(selectedInvoice.subtotal || 0)}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Discount:</span><span>-{formatCurrency(selectedInvoice.discount || 0)}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Tax:</span><span>{formatCurrency(selectedInvoice.tax || 0)}</span></div>
                                    <div className="flex justify-between text-base font-bold border-t border-slate-100 pt-2">
                                        <span>Total:</span>
                                        <span>{formatCurrency(selectedInvoice.total || 0)}</span>
                                    </div>
                                    <div className="flex justify-between text-emerald-600">
                                        <span>Paid:</span>
                                        <span>{formatCurrency(selectedInvoice.paid || 0)}</span>
                                    </div>
                                    <div className="flex justify-between text-red-600 font-medium">
                                        <span>Balance:</span>
                                        <span>{formatCurrency(selectedInvoice.balance || 0)}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Modal>
                </div>
            );
        };

        // ==========================================
        // ADMISSIONS / WARD MODULE
        // ==========================================
        const AdmissionsModule = () => {
            const [selectedWard, setSelectedWard] = useState(null);
            const [showNewAdmission, setShowNewAdmission] = useState(false);
            const [admissions, setAdmissions] = useState(hydrateSeedData().admissions || []);
            const [admissionForm, setAdmissionForm] = useState({ patientId: '', ward: '', bedNumber: '', doctorId: '', diagnosis: '', acuity: 'stable' });

            const handleCreateAdmission = async () => {
                if (!admissionForm.patientId) return;
                const payload = {
                    id: 'adm_' + Date.now(),
                    patientId: admissionForm.patientId,
                    ward: admissionForm.ward,
                    bedNumber: admissionForm.bedNumber,
                    admissionDate: new Date().toISOString().split('T')[0],
                    dischargeDate: null,
                    doctorId: admissionForm.doctorId,
                    diagnosis: admissionForm.diagnosis,
                    status: 'active',
                    acuity: admissionForm.acuity
                };

                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('admit patient');
                const { data, error } = await client.from('admissions').insert([{ ...payload, patient_id: payload.patientId, ward: payload.ward, bed_number: payload.bedNumber, admission_date: payload.admissionDate, doctor_id: payload.doctorId || null, diagnosis: payload.diagnosis, status: payload.status, acuity: payload.acuity }]).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('admit patient', error);
                const mapped = { ...payload, id: data[0].id, patientId: data[0].patient_id || payload.patientId, doctorId: data[0].doctor_id || payload.doctorId, bedNumber: data[0].bed_number || payload.bedNumber, admissionDate: data[0].admission_date || payload.admissionDate };
                const next = [...admissions, mapped];
                persistSeedTable('admissions', next);
                setAdmissions(next);
                setShowNewAdmission(false);
                setAdmissionForm({ patientId: '', ward: '', bedNumber: '', doctorId: '', diagnosis: '', acuity: 'stable' });
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Ward Management</h2>
                            <p className="text-slate-500 mt-1">Bed allocation and patient admissions</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus} onClick={() => setShowNewAdmission(true)}>New Admission</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {(seedData.wards || []).map(ward => (
                            <Card 
                                key={ward.id} 
                                className="cursor-pointer hover:border-medical-300 transition-colors"
                                onClick={() => setSelectedWard(ward)}
                            >
                                <div className="text-center">
                                    <div className={'w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ' + (ward.occupied >= ward.capacity * 0.9 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600')}>
                                        <Icons.Bed size={24} />
                                    </div>
                                    <h3 className="font-semibold text-slate-900">{ward.name}</h3>
                                    <p className="text-2xl font-bold text-slate-900 mt-1">{ward.occupied}/{ward.capacity}</p>
                                    <p className="text-xs text-slate-500">{Math.round((ward.occupied / ward.capacity) * 100)}% occupied</p>
                                    <div className="mt-2">
                                        <ProgressBar value={ward.occupied} max={ward.capacity} color={ward.occupied >= ward.capacity * 0.9 ? 'red' : 'emerald'} size="sm" />
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>

                    <Card title="Current Admissions">
                        <DataTable
                            columns={[
                                { key: 'patient', title: 'Patient', render: (row) => {
                                    const patient = seedData.patients.find(p => p.id === row.patientId);
                                    return (
                                        <div className="flex items-center gap-2">
                                            <Avatar name={patient?.firstName + ' ' + patient?.lastName} size="sm" />
                                            <span>{patient?.firstName} {patient?.lastName}</span>
                                        </div>
                                    );
                                }},
                                { key: 'ward', title: 'Ward' },
                                { key: 'bedNumber', title: 'Bed' },
                                { key: 'admissionDate', title: 'Admitted', render: (row) => formatDate(row.admissionDate) },
                                { key: 'diagnosis', title: 'Diagnosis' },
                                { key: 'doctor', title: 'Doctor', render: (row) => {
                                    const doctor = seedData.users.find(u => u.id === row.doctorId);
                                    return doctor?.name || 'Unknown';
                                }},
                                { key: 'acuity', title: 'Acuity', render: (row) => <Badge variant={row.acuity === 'critical' ? 'danger' : row.acuity === 'moderate' ? 'warning' : 'success'}>{row.acuity}</Badge> }
                            ]}
                            data={admissions.filter(a => a.status === 'active')}
                            actions={(row) => (
                                <>
                                    <Button variant="primary" size="sm">Transfer</Button>
                                    <Button variant="secondary" size="sm">Discharge</Button>
                                </>
                            )}
                        />
                    </Card>

                    <Modal
                        isOpen={showNewAdmission}
                        onClose={() => setShowNewAdmission(false)}
                        title="New Admission"
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowNewAdmission(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleCreateAdmission}>Admit Patient</Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <Select label="Patient" value={admissionForm.patientId} onChange={(e) => setAdmissionForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(hydrateSeedData().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Select label="Ward" value={admissionForm.ward} onChange={(e) => setAdmissionForm(prev => ({ ...prev, ward: e.target.value }))} options={[{ value: 'General Ward', label: 'General Ward' }, { value: 'ICU', label: 'ICU' }, { value: 'Maternity', label: 'Maternity' }, { value: 'Pediatrics', label: 'Pediatrics' }]} />
                            <Input label="Bed Number" value={admissionForm.bedNumber} onChange={(e) => setAdmissionForm(prev => ({ ...prev, bedNumber: e.target.value }))} />
                            <Select label="Doctor" value={admissionForm.doctorId} onChange={(e) => setAdmissionForm(prev => ({ ...prev, doctorId: e.target.value }))} options={[{ value: '', label: 'Unassigned' }, ...(seedData.users || []).filter(user => user.role === 'doctor').map(user => ({ value: user.id, label: user.name }))]} />
                            <Input label="Diagnosis" value={admissionForm.diagnosis} onChange={(e) => setAdmissionForm(prev => ({ ...prev, diagnosis: e.target.value }))} />
                            <Select label="Acuity" value={admissionForm.acuity} onChange={(e) => setAdmissionForm(prev => ({ ...prev, acuity: e.target.value }))} options={[{ value: 'stable', label: 'Stable' }, { value: 'moderate', label: 'Moderate' }, { value: 'critical', label: 'Critical' }]} />
                        </div>
                    </Modal>

                    <Modal
                        isOpen={!!selectedWard}
                        onClose={() => setSelectedWard(null)}
                        title={(selectedWard?.name || '') + ' - Bed Map'}
                        size="lg"
                    >
                        {selectedWard && (
                            <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                                {(seedData.beds || []).filter(b => b.wardId === selectedWard.id).map(bed => (
                                    <div 
                                        key={bed.id} 
                                        className={'p-4 rounded-xl border-2 text-center cursor-pointer transition-all ' + (bed.status === 'occupied' ? 'border-red-200 bg-red-50' : bed.status === 'available' ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : 'border-slate-200 bg-slate-50')}
                                    >
                                        <Icons.Bed size={24} className={'mx-auto mb-2 ' + (bed.status === 'occupied' ? 'text-red-500' : bed.status === 'available' ? 'text-emerald-500' : 'text-slate-400')} />
                                        <p className="text-xs font-medium text-slate-700">{bed.bedNumber}</p>
                                        <Badge variant={bed.status === 'occupied' ? 'danger' : bed.status === 'available' ? 'success' : 'default'} className="mt-1 text-xs">{bed.status}</Badge>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Modal>
                </div>
            );
        };

        // ==========================================
        // SURGERIES MODULE
        // ==========================================
        const SurgeriesModule = () => {
            const [showSchedule, setShowSchedule] = useState(false);
            const [surgeries, setSurgeries] = useState(hydrateSeedData().surgeries || []);
            const [surgeryForm, setSurgeryForm] = useState({ patientId: '', surgeonId: '', procedure: '', scheduledDate: '', scheduledTime: '', otRoom: '', anesthesia: '', priority: 'elective' });

            const handleScheduleSurgery = async () => {
                if (!surgeryForm.patientId || !surgeryForm.procedure) return;

                const payload = {
                    id: 'srg_' + Date.now(),
                    patientId: surgeryForm.patientId,
                    surgeonId: surgeryForm.surgeonId,
                    procedure: surgeryForm.procedure,
                    scheduledDate: surgeryForm.scheduledDate,
                    scheduledTime: surgeryForm.scheduledTime,
                    duration: '90 min',
                    status: 'scheduled',
                    otRoom: surgeryForm.otRoom,
                    anesthesia: surgeryForm.anesthesia,
                    priority: surgeryForm.priority
                };

                const client = window.MedicoreSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('schedule surgery');
                const { data, error } = await client.from('surgeries').insert([{ ...payload, patient_id: payload.patientId, surgeon_id: payload.surgeonId || null, procedure: payload.procedure, scheduled_date: payload.scheduledDate, scheduled_time: payload.scheduledTime, duration: payload.duration, status: payload.status, ot_room: payload.otRoom, anesthesia: payload.anesthesia, priority: payload.priority }]).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('schedule surgery', error);
                const mapped = { ...payload, id: data[0].id, patientId: data[0].patient_id || payload.patientId, surgeonId: data[0].surgeon_id || payload.surgeonId, scheduledDate: data[0].scheduled_date || payload.scheduledDate, scheduledTime: data[0].scheduled_time || payload.scheduledTime, otRoom: data[0].ot_room || payload.otRoom };
                const next = [...surgeries, mapped];
                persistSeedTable('surgeries', next);
                setSurgeries(next);
                setShowSchedule(false);
                setSurgeryForm({ patientId: '', surgeonId: '', procedure: '', scheduledDate: '', scheduledTime: '', otRoom: '', anesthesia: '', priority: 'elective' });
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Operating Theatre</h2>
                            <p className="text-slate-500 mt-1">Surgery scheduling and management</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus} onClick={() => setShowSchedule(true)}>Schedule Surgery</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Scheduled Today" value={surgeries.filter(s => s.scheduledDate === new Date().toISOString().slice(0, 10)).length} icon={Icons.Calendar} color="medical" />
                        <StatCard title="In Progress" value={surgeries.filter(s => s.status === 'in-progress').length} icon={Icons.Activity} color="amber" />
                        <StatCard title="Completed" value={surgeries.filter(s => s.status === 'completed').length} icon={Icons.CheckCircle} color="emerald" />
                        <StatCard title="Emergency" value={surgeries.filter(s => s.priority === 'emergency').length} icon={Icons.AlertCircle} color="red" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card title="OT Schedule" className="lg:col-span-2">
                            <DataTable
                                columns={[
                                    { key: 'scheduledTime', title: 'Time' },
                                    { key: 'procedure', title: 'Procedure' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'surgeon', title: 'Surgeon', render: (row) => {
                                        const surgeon = seedData.users.find(u => u.id === row.surgeonId);
                                        return surgeon?.name || 'Unknown';
                                    }},
                                    { key: 'otRoom', title: 'OT Room' },
                                    { key: 'priority', title: 'Priority', render: (row) => <Badge variant={row.priority === 'emergency' ? 'danger' : row.priority === 'urgent' ? 'warning' : 'default'}>{row.priority}</Badge> },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'in-progress' ? 'info' : 'default'}>{row.status}</Badge> }
                                ]}
                                data={surgeries.sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''))}
                                actions={(row) => (
                                    <Button variant="primary" size="sm">Details</Button>
                                )}
                            />
                        </Card>
                        <Card title="OT Rooms Status">
                            <div className="space-y-3">
                                {Array.from({ length: 6 }, (_, i) => {
                                    const room = 'OT-' + (i + 1);
                                    const currentSurgery = surgeries.find(s => s.otRoom === room && s.status === 'in-progress');
                                    return (
                                        <div key={room} className={'p-3 rounded-lg border ' + (currentSurgery ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200')}>
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-slate-900">{room}</span>
                                                <Badge variant={currentSurgery ? 'danger' : 'success'}>{currentSurgery ? 'Occupied' : 'Available'}</Badge>
                                            </div>
                                            {currentSurgery && (
                                                <p className="text-xs text-slate-600 mt-1">{currentSurgery.procedure}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    </div>

                    <Modal
                        isOpen={showSchedule}
                        onClose={() => setShowSchedule(false)}
                        title="Schedule Surgery"
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowSchedule(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleScheduleSurgery}>Save Surgery</Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <Select label="Patient" value={surgeryForm.patientId} onChange={(e) => setSurgeryForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(hydrateSeedData().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Select label="Surgeon" value={surgeryForm.surgeonId} onChange={(e) => setSurgeryForm(prev => ({ ...prev, surgeonId: e.target.value }))} options={[{ value: '', label: 'Unassigned' }, ...(seedData.users || []).filter(user => user.role === 'doctor').map(user => ({ value: user.id, label: user.name }))]} />
                            <Input label="Procedure" value={surgeryForm.procedure} onChange={(e) => setSurgeryForm(prev => ({ ...prev, procedure: e.target.value }))} />
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Date" type="date" value={surgeryForm.scheduledDate} onChange={(e) => setSurgeryForm(prev => ({ ...prev, scheduledDate: e.target.value }))} />
                                <Input label="Time" type="time" value={surgeryForm.scheduledTime} onChange={(e) => setSurgeryForm(prev => ({ ...prev, scheduledTime: e.target.value }))} />
                            </div>
                            <Select label="OT Room" value={surgeryForm.otRoom} onChange={(e) => setSurgeryForm(prev => ({ ...prev, otRoom: e.target.value }))} options={[{ value: 'OT-1', label: 'OT-1' }, { value: 'OT-2', label: 'OT-2' }, { value: 'OT-3', label: 'OT-3' }, { value: 'OT-4', label: 'OT-4' }]} />
                            <Select label="Priority" value={surgeryForm.priority} onChange={(e) => setSurgeryForm(prev => ({ ...prev, priority: e.target.value }))} options={[{ value: 'elective', label: 'Elective' }, { value: 'urgent', label: 'Urgent' }, { value: 'emergency', label: 'Emergency' }]} />
                            <Input label="Anesthesia" value={surgeryForm.anesthesia} onChange={(e) => setSurgeryForm(prev => ({ ...prev, anesthesia: e.target.value }))} />
                        </div>
                    </Modal>
                </div>
            );
        };
