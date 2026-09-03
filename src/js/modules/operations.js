        // ==========================================
        // OPERATIONS COMMAND CENTRE
        // ==========================================
        const OperationsModule = () => {
            const [activeTab, setActiveTab] = useState('flow');
            const [selectedDept, setSelectedDept] = useState('all');

            const managementDepartments = [
                { name: 'Emergency', patients: 48, waitMinutes: 18, occupancy: 82, turnaround: 91 },
                { name: 'Inpatient', patients: 112, waitMinutes: 12, occupancy: 76, turnaround: 87 },
                { name: 'Outpatient', patients: 164, waitMinutes: 14, occupancy: 80, turnaround: 93 },
                { name: 'Diagnostics', patients: 96, waitMinutes: 22, occupancy: 71, turnaround: 85 },
                { name: 'Surgery', patients: 24, waitMinutes: 9, occupancy: 68, turnaround: 89 }
            ];

            const filteredDepartments = selectedDept === 'all'
                ? managementDepartments
                : managementDepartments.filter((department) => department.name.toLowerCase() === selectedDept.toLowerCase());

            const avgWait = Math.round(filteredDepartments.reduce((sum, item) => sum + item.waitMinutes, 0) / Math.max(1, filteredDepartments.length));
            const avgOccupancy = Math.round(filteredDepartments.reduce((sum, item) => sum + item.occupancy, 0) / Math.max(1, filteredDepartments.length));
            const totalPatients = filteredDepartments.reduce((sum, item) => sum + item.patients, 0);

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
                        <StatCard title="Avg Wait" value={`${avgWait} min`} icon={Icons.Clock} color="amber" />
                        <StatCard title="Occupancy" value={`${avgOccupancy}%`} icon={Icons.Bed} color="emerald" />
                        <StatCard title="Throughput" value={`${Math.max(80, Math.min(99, avgOccupancy + 10))}%`} icon={Icons.Activity} color="violet" />
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
                                                <Badge variant={department.turnaround >= 90 ? 'success' : department.turnaround >= 85 ? 'warning' : 'default'}>{department.turnaround}% turnaround</Badge>
                                            </div>
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                                        <span>Wait time</span>
                                                        <span>{department.waitMinutes} min</span>
                                                    </div>
                                                    <ProgressBar value={Math.min(100, department.waitMinutes * 3)} max={100} color="amber" />
                                                </div>
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
                                    {[
                                        { label: 'Admissions today', value: '126', trend: '+8%' },
                                        { label: 'Discharges today', value: '108', trend: '+5%' },
                                        { label: 'Emergency arrivals', value: '34', trend: '+12%' },
                                        { label: 'Cancelled appointments', value: '9', trend: '-3%' }
                                    ].map((metric) => (
                                        <div key={metric.label} className="rounded-xl border border-slate-200 p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-600">{metric.label}</span>
                                                <span className="text-xs font-medium text-emerald-600">{metric.trend}</span>
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
                                    data={[
                                        { label: 'ER', value: 82 },
                                        { label: 'Ward', value: 76 },
                                        { label: 'ICU', value: 68 },
                                        { label: 'Maternity', value: 58 },
                                        { label: 'Pediatrics', value: 63 }
                                    ]}
                                    width={500}
                                    height={260}
                                    color="#2563eb"
                                />
                            </Card>

                            <Card title="Clinical Resource Load">
                                <div className="space-y-4">
                                    {[
                                        { name: 'Doctors on duty', value: 86 },
                                        { name: 'Nurses assigned', value: 91 },
                                        { name: 'Lab bench capacity', value: 74 },
                                        { name: 'Imaging availability', value: 69 }
                                    ].map((resource) => (
                                        <div key={resource.name}>
                                            <div className="flex items-center justify-between text-sm text-slate-600 mb-1">
                                                <span>{resource.name}</span>
                                                <span>{resource.value}%</span>
                                            </div>
                                            <ProgressBar value={resource.value} max={100} color={resource.value >= 85 ? 'emerald' : resource.value >= 70 ? 'amber' : 'medical'} />
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'logistics' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {[
                                { title: 'Pharmacy refill', status: 'On track', detail: '18 items due within 48h', tone: 'success' },
                                { title: 'Medical supplies', status: 'Watchlist', detail: '4 SKUs below reorder threshold', tone: 'warning' },
                                { title: 'Equipment uptime', status: 'Stable', detail: '97.4% availability across units', tone: 'info' }
                            ].map((item) => (
                                <Card key={item.title} title={item.title}>
                                    <div className="space-y-3">
                                        <Badge variant={item.tone === 'success' ? 'success' : item.tone === 'warning' ? 'warning' : 'info'}>{item.status}</Badge>
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
        // PROCUREMENT MODULE
        // ==========================================
        const ProcurementModule = () => {
            const [activeTab, setActiveTab] = useState('orders');
            const supplierPerformance = [
                { name: 'MedSource Ltd', onTime: 97, spend: 182000, risk: 'Low' },
                { name: 'CareLab Supply', onTime: 89, spend: 132000, risk: 'Medium' },
                { name: 'Global ICU', onTime: 94, spend: 214000, risk: 'Low' },
                { name: 'NorthStar Pharma', onTime: 76, spend: 98000, risk: 'High' }
            ];

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
                        <StatCard title="Open POs" value="32" icon={Icons.Packages} color="medical" />
                        <StatCard title="Monthly Spend" value={formatCurrency(624000)} icon={Icons.DollarSign} color="emerald" />
                        <StatCard title="Late Deliveries" value="6" icon={Icons.AlertCircle} color="amber" />
                        <StatCard title="Savings" value={formatCurrency(48000)} icon={Icons.CheckCircle} color="violet" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'orders' && (
                        <Card>
                            <DataTable
                                columns={[
                                    { key: 'poNumber', title: 'PO #', className: 'font-mono text-xs' },
                                    { key: 'vendor', title: 'Vendor' },
                                    { key: 'category', title: 'Category' },
                                    { key: 'amount', title: 'Amount', render: (row) => formatCurrency(row.amount) },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'approved' ? 'success' : row.status === 'pending' ? 'warning' : 'danger'}>{row.status}</Badge> },
                                    { key: 'eta', title: 'ETA', render: (row) => formatDate(row.eta) }
                                ]}
                                data={[
                                    { poNumber: 'PO-1042', vendor: 'MedSource Ltd', category: 'Medical Supplies', amount: 42000, status: 'approved', eta: '2026-09-06' },
                                    { poNumber: 'PO-1047', vendor: 'Global ICU', category: 'Critical Care', amount: 68000, status: 'in_transit', eta: '2026-09-08' },
                                    { poNumber: 'PO-1050', vendor: 'NorthStar Pharma', category: 'Pharmacy', amount: 24000, status: 'pending', eta: '2026-09-10' }
                                ]}
                            />
                        </Card>
                    )}

                    {activeTab === 'suppliers' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {supplierPerformance.map((supplier) => (
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
                            ))}
                        </div>
                    )}

                    {activeTab === 'analytics' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Monthly Spend Trend">
                                <BarChart
                                    data={[
                                        { label: 'Jan', value: 510000 },
                                        { label: 'Feb', value: 548000 },
                                        { label: 'Mar', value: 590000 },
                                        { label: 'Apr', value: 620000 },
                                        { label: 'May', value: 624000 }
                                    ]}
                                    width={500}
                                    height={260}
                                    color="#10b981"
                                />
                            </Card>
                            <Card title="Category Spend">
                                <div className="space-y-4">
                                    {[
                                        { label: 'Medical supplies', value: 210000 },
                                        { label: 'Pharmacy', value: 174000 },
                                        { label: 'Diagnostics', value: 146000 },
                                        { label: 'Critical care', value: 94000 }
                                    ].map((item) => (
                                        <div key={item.label}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-slate-600">{item.label}</span>
                                                <span className="font-medium text-slate-900">{formatCurrency(item.value)}</span>
                                            </div>
                                            <ProgressBar value={Math.min(100, (item.value / 210000) * 100)} max={100} color="emerald" />
                                        </div>
                                    ))}
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

            const referralQueue = [
                { id: 'REF-2101', patient: 'Miriam Abiola', specialty: 'Cardiology', status: 'Pending', due: 'Today', risk: 'High' },
                { id: 'REF-2107', patient: 'Emmanuel Udo', specialty: 'Orthopedics', status: 'In progress', due: '2 days', risk: 'Moderate' },
                { id: 'REF-2120', patient: 'Ifeoma Bello', specialty: 'Nephrology', status: 'Accepted', due: 'Tomorrow', risk: 'High' },
                { id: 'REF-2134', patient: 'Tunde Okon', specialty: 'Neurology', status: 'Scheduled', due: '3 days', risk: 'Low' }
            ];

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
                        <StatCard title="Follow-ups" value="19" icon={Icons.Calendar} color="violet" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'referrals' && (
                        <Card>
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
        // PHARMACY MODULE
        // ==========================================
        const PharmacyModule = () => {
            const [activeTab, setActiveTab] = useState('dispensary');
            const [searchQuery, setSearchQuery] = useState('');
            const [inventory, setInventory] = useState(hydrateSeedData().pharmacyInventory || []);
            const [showAddStock, setShowAddStock] = useState(false);
            const [stockForm, setStockForm] = useState({ name: '', genericName: '', category: 'General', stockQuantity: 10, reorderLevel: 5, unitPrice: 20, expiryDate: '2026-12-31', supplier: '' });

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

                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                if (client) {
                    const { data, error } = await client.from('pharmacy_inventory').insert([{ ...payload, generic_name: payload.genericName, stock_quantity: payload.stockQuantity, reorder_level: payload.reorderLevel, unit_price: payload.unitPrice, expiry_date: payload.expiryDate }]).select();
                    if (!error && data && data[0]) {
                        const mapped = { ...payload, id: data[0].id || payload.id, genericName: data[0].generic_name || payload.genericName, stockQuantity: data[0].stock_quantity ?? payload.stockQuantity, reorderLevel: data[0].reorder_level ?? payload.reorderLevel, unitPrice: data[0].unit_price ?? payload.unitPrice, expiryDate: data[0].expiry_date || payload.expiryDate };
                        const next = [...inventory, mapped];
                        persistSeedTable('pharmacyInventory', next);
                        setInventory(next);
                        setShowAddStock(false);
                        setStockForm({ name: '', genericName: '', category: 'General', stockQuantity: 10, reorderLevel: 5, unitPrice: 20, expiryDate: '2026-12-31', supplier: '' });
                        return;
                    }
                }

                const next = [...inventory, payload];
                persistSeedTable('pharmacyInventory', next);
                setInventory(next);
                setShowAddStock(false);
                setStockForm({ name: '', genericName: '', category: 'General', stockQuantity: 10, reorderLevel: 5, unitPrice: 20, expiryDate: '2026-12-31', supplier: '' });
            };

            const handleDispense = async (prescription) => {
                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                const updatedPrescription = { ...prescription, status: 'dispensed' };

                if (client) {
                    const { error } = await client.from('prescriptions').update({ status: 'dispensed' }).eq('id', prescription.id);
                    if (error) {
                        console.error('Prescription dispense failed:', error);
                    }
                }

                const nextInventory = inventory.map((item) => {
                    if (prescription.medications && prescription.medications.length > 0 && item.name === prescription.medications[0].name) {
                        return { ...item, stockQuantity: Math.max(0, Number(item.stockQuantity || 0) - Number(prescription.medications[0].quantity || 1)) };
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
        const BillingModule = () => {
            const [activeTab, setActiveTab] = useState('invoices');
            const [selectedInvoice, setSelectedInvoice] = useState(null);
            const [showNewInvoice, setShowNewInvoice] = useState(false);
            const [invoices, setInvoices] = useState(hydrateSeedData().billing || []);
            const [invoiceForm, setInvoiceForm] = useState({ patientId: '', invoiceNumber: 'INV-' + Date.now(), total: 250, paid: 0, status: 'pending' });

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

                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                if (client) {
                    const { data, error } = await client.from('billing').insert([{ ...payload, patient_id: payload.patientId, invoice_number: payload.invoiceNumber, invoice_date: payload.date, subtotal: payload.subtotal, tax: payload.tax, total: payload.total, paid: payload.paid, balance: payload.balance, payment_method: payload.paymentMethod, status: payload.status }]).select();
                    if (!error && data && data[0]) {
                        const mapped = { ...payload, id: data[0].id || payload.id, patientId: data[0].patient_id || payload.patientId, invoiceNumber: data[0].invoice_number || payload.invoiceNumber, date: data[0].invoice_date || payload.date, paymentMethod: data[0].payment_method || payload.paymentMethod };
                        const next = [...invoices, mapped];
                        persistSeedTable('billing', next);
                        setInvoices(next);
                        setShowNewInvoice(false);
                        setInvoiceForm({ patientId: '', invoiceNumber: 'INV-' + Date.now(), total: 250, paid: 0, status: 'pending' });
                        return;
                    }
                }

                const next = [...invoices, payload];
                persistSeedTable('billing', next);
                setInvoices(next);
                setShowNewInvoice(false);
                setInvoiceForm({ patientId: '', invoiceNumber: 'INV-' + Date.now(), total: 250, paid: 0, status: 'pending' });
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Billing</h2>
                            <p className="text-slate-500 mt-1">Invoices, payments, and insurance</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus} onClick={() => setShowNewInvoice(true)}>Create Invoice</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Total Revenue" value={formatCurrency(invoices.reduce((s, b) => s + parseFloat(b.total || 0), 0))} icon={Icons.DollarSign} color="emerald" />
                        <StatCard title="Outstanding" value={formatCurrency(invoices.reduce((s, b) => s + parseFloat(b.balance || 0), 0))} icon={Icons.AlertCircle} color="amber" />
                        <StatCard title="Collected" value={formatCurrency(invoices.reduce((s, b) => s + parseFloat(b.paid || 0), 0))} icon={Icons.CheckCircle} color="medical" />
                        <StatCard title="Pending Claims" value={(seedData.insuranceClaims || []).filter(c => c.status === 'pending').length} icon={Icons.Shield} color="violet" />
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
                        <Card>
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
                                data={seedData.insuranceClaims || []}
                            />
                        </Card>
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
                                        <span className="font-medium text-slate-900">{formatCurrency(invoices.reduce((s, b) => s + parseFloat(b.paid || 0), 0))}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-700">Outstanding</span>
                                        <span className="font-medium text-slate-900">{formatCurrency(invoices.reduce((s, b) => s + parseFloat(b.balance || 0), 0))}</span>
                                    </div>
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
            const [admissionForm, setAdmissionForm] = useState({ patientId: '', ward: 'General Ward', bedNumber: 'A-101', doctorId: 'u2', diagnosis: 'Observation', acuity: 'stable' });

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

                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                if (client) {
                    const { data, error } = await client.from('admissions').insert([{ ...payload, patient_id: payload.patientId, ward: payload.ward, bed_number: payload.bedNumber, admission_date: payload.admissionDate, doctor_id: payload.doctorId, diagnosis: payload.diagnosis, status: payload.status, acuity: payload.acuity }]).select();
                    if (!error && data && data[0]) {
                        const mapped = { ...payload, id: data[0].id || payload.id, patientId: data[0].patient_id || payload.patientId, doctorId: data[0].doctor_id || payload.doctorId, bedNumber: data[0].bed_number || payload.bedNumber, admissionDate: data[0].admission_date || payload.admissionDate };
                        const next = [...admissions, mapped];
                        persistSeedTable('admissions', next);
                        setAdmissions(next);
                        setShowNewAdmission(false);
                        setAdmissionForm({ patientId: '', ward: 'General Ward', bedNumber: 'A-101', doctorId: 'u2', diagnosis: 'Observation', acuity: 'stable' });
                        return;
                    }
                }

                const next = [...admissions, payload];
                persistSeedTable('admissions', next);
                setAdmissions(next);
                setShowNewAdmission(false);
                setAdmissionForm({ patientId: '', ward: 'General Ward', bedNumber: 'A-101', doctorId: 'u2', diagnosis: 'Observation', acuity: 'stable' });
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
                            <Select label="Doctor" value={admissionForm.doctorId} onChange={(e) => setAdmissionForm(prev => ({ ...prev, doctorId: e.target.value }))} options={[{ value: 'u2', label: 'Dr. Sarah Smith' }, { value: 'u3', label: 'Dr. Michael Jones' }]} />
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
            const [surgeryForm, setSurgeryForm] = useState({ patientId: '', surgeonId: 'u2', procedure: 'Appendectomy', scheduledDate: '2026-09-01', scheduledTime: '09:00', otRoom: 'OT-1', anesthesia: 'General', priority: 'elective' });

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

                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                if (client) {
                    const { data, error } = await client.from('surgeries').insert([{ ...payload, patient_id: payload.patientId, surgeon_id: payload.surgeonId, procedure: payload.procedure, scheduled_date: payload.scheduledDate, scheduled_time: payload.scheduledTime, duration: payload.duration, status: payload.status, ot_room: payload.otRoom, anesthesia: payload.anesthesia, priority: payload.priority }]).select();
                    if (!error && data && data[0]) {
                        const mapped = { ...payload, id: data[0].id || payload.id, patientId: data[0].patient_id || payload.patientId, surgeonId: data[0].surgeon_id || payload.surgeonId, scheduledDate: data[0].scheduled_date || payload.scheduledDate, scheduledTime: data[0].scheduled_time || payload.scheduledTime, otRoom: data[0].ot_room || payload.otRoom };
                        const next = [...surgeries, mapped];
                        persistSeedTable('surgeries', next);
                        setSurgeries(next);
                        setShowSchedule(false);
                        setSurgeryForm({ patientId: '', surgeonId: 'u2', procedure: 'Appendectomy', scheduledDate: '2026-09-01', scheduledTime: '09:00', otRoom: 'OT-1', anesthesia: 'General', priority: 'elective' });
                        return;
                    }
                }

                const next = [...surgeries, payload];
                persistSeedTable('surgeries', next);
                setSurgeries(next);
                setShowSchedule(false);
                setSurgeryForm({ patientId: '', surgeonId: 'u2', procedure: 'Appendectomy', scheduledDate: '2026-09-01', scheduledTime: '09:00', otRoom: 'OT-1', anesthesia: 'General', priority: 'elective' });
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
                        <StatCard title="Scheduled Today" value={surgeries.filter(s => s.scheduledDate === '2026-09-01').length} icon={Icons.Calendar} color="medical" />
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
                            <Select label="Surgeon" value={surgeryForm.surgeonId} onChange={(e) => setSurgeryForm(prev => ({ ...prev, surgeonId: e.target.value }))} options={[{ value: 'u2', label: 'Dr. Sarah Smith' }, { value: 'u3', label: 'Dr. Michael Jones' }]} />
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
