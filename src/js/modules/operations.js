        // ==========================================
        // OPERATIONS COMMAND CENTRE
        // ==========================================
        const OperationsModule = () => {
            const [activeTab, setActiveTab] = useState('flow');
            const [selectedDept, setSelectedDept] = useState('all');

            const activeAdmissions = (appData.admissions || []).filter(item => item.status === 'active');
            const managementDepartments = (appData.wards || []).map((ward) => ({
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
                { label: 'Admissions today', value: (appData.admissions || []).filter(item => item.admissionDate === today).length },
                { label: 'Discharges today', value: (appData.admissions || []).filter(item => item.dischargeDate === today).length },
                { label: 'Emergency appointments', value: (appData.appointments || []).filter(item => item.date === today && String(item.department || '').toLowerCase().includes('emergency')).length },
                { label: 'Cancelled appointments', value: (appData.appointments || []).filter(item => item.date === today && item.status === 'cancelled').length }
            ];
            const resourceLoad = [
                { name: 'Active doctors', value: (appData.users || []).filter(item => item.role === 'doctor' && item.status === 'active').length },
                { name: 'Active nurses', value: (appData.users || []).filter(item => item.role === 'nurse' && item.status === 'active').length },
                { name: 'Pending laboratory orders', value: (appData.labOrders || []).filter(item => item.status !== 'completed').length },
                { name: 'Pending imaging orders', value: (appData.radiologyOrders || []).filter(item => item.status !== 'reported').length }
            ];
            const logistics = [
                { title: 'Low-stock medicines', value: (appData.pharmacyInventory || []).filter(item => Number(item.stockQuantity) <= Number(item.reorderLevel)).length },
                { title: 'Expiring inventory', value: (appData.pharmacyInventory || []).filter(item => item.expiryDate && new Date(item.expiryDate) <= new Date(Date.now() + 30 * 86400000)).length },
                { title: 'Pending refill requests', value: (appData.refillRequests || []).filter(item => item.status === 'pending').length }
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
                        <StatCard title="Open appointments" value={(appData.appointments || []).filter(item => item.status === 'scheduled' || item.status === 'requested').length} icon={Icons.Activity} color="violet" />
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
            const inventory = appData.pharmacyInventory || [];
            const supplierInventory = Object.entries(inventory.reduce((groups, item) => {
                const supplier = item.supplier || 'Unassigned supplier';
                groups[supplier] = groups[supplier] || { supplier, items: 0, stockValue: 0, lowStock: 0 };
                groups[supplier].items += 1;
                groups[supplier].stockValue += Number(item.stockQuantity || 0) * Number(item.unitPrice || 0);
                groups[supplier].lowStock += Number(item.stockQuantity || 0) <= Number(item.reorderLevel || 0) ? 1 : 0;
                return groups;
            }, {})).map(([, supplier]) => supplier);
            const lowStockItems = inventory.filter((item) => Number(item.stockQuantity || 0) <= Number(item.reorderLevel || 0));

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
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Inventory items" value={inventory.length} icon={Icons.Packages} color="medical" />
                        <StatCard title="Low-stock items" value={lowStockItems.length} icon={Icons.AlertCircle} color="amber" />
                        <StatCard title="Suppliers" value={supplierInventory.filter((item) => item.supplier !== 'Unassigned supplier').length} icon={Icons.CheckCircle} color="violet" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'orders' && (
                        <Card>
                            <DataTable columns={[{ key: 'name', title: 'Item' }, { key: 'supplier', title: 'Supplier' }, { key: 'stockQuantity', title: 'Stock' }, { key: 'reorderLevel', title: 'Reorder level' }, { key: 'unitPrice', title: 'Unit price', render: (row) => formatCurrency(row.unitPrice) }]} data={inventory} />
                        </Card>
                    )}

                    {activeTab === 'suppliers' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {supplierInventory.length ? supplierInventory.map((supplier) => (
                                <Card key={supplier.supplier} title={supplier.supplier}><div className="space-y-3 text-sm"><p>{supplier.items} stocked item{supplier.items === 1 ? '' : 's'}</p><p>Low-stock items: {supplier.lowStock}</p></div></Card>
                            )) : (
                                <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No supplier records are connected yet. Supplier performance will appear automatically once the inventory workflow is live.</div>
                            )}
                        </div>
                    )}

                    {activeTab === 'analytics' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Inventory items by category"><BarChart data={Object.entries(inventory.reduce((groups, item) => { const category = item.category || 'Uncategorized'; groups[category] = (groups[category] || 0) + 1; return groups; }, {})).map(([label, value]) => ({ label, value }))} width={500} height={260} color="#10b981" /></Card>
                            <Card title="Low-stock inventory"><DataTable columns={[{ key: 'name', title: 'Item' }, { key: 'stockQuantity', title: 'Stock' }, { key: 'reorderLevel', title: 'Reorder level' }]} data={lowStockItems} /></Card>
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

            const followUpTasks = (appData.clinicalTasks || []).filter((task) => task.taskType === 'follow_up' || task.taskType === 'followup');
            const handoffTasks = (appData.clinicalTasks || []).filter((task) => task.taskType === 'handoff');

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
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Open follow-ups" value={followUpTasks.filter((task) => task.status === 'open' || task.status === 'in_progress').length} icon={Icons.UserCheck} color="medical" />
                        <StatCard title="Urgent follow-ups" value={followUpTasks.filter((task) => task.priority === 'urgent' || task.priority === 'stat').length} icon={Icons.AlertCircle} color="red" />
                        <StatCard title="Completed follow-ups" value={followUpTasks.filter((task) => task.status === 'completed').length} icon={Icons.CheckCircle} color="emerald" />
                        <StatCard title="Follow-ups" value={followUpTasks.length} icon={Icons.Calendar} color="violet" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'referrals' && (
                        <Card>
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Referral records are not configured in this Supabase schema. This screen only displays persisted follow-up and handoff tasks.</div>
                        </Card>
                    )}

                    {activeTab === 'followups' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Follow-up Schedule">
                                {followUpTasks.length ? <DataTable columns={[{ key: 'title', title: 'Task' }, { key: 'dueAt', title: 'Due', render: (row) => formatDateTime(row.dueAt) }, { key: 'priority', title: 'Priority' }, { key: 'status', title: 'Status' }]} data={followUpTasks} /> : <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No follow-up tasks have been recorded.</p>}
                            </Card>

                            <Card title="Care Pathway Completion">
                                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">Care-pathway completion will be calculated after pathway milestones are configured.</p>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'handoffs' && (
                        <Card title="Persisted handoffs">{handoffTasks.length ? <DataTable columns={[{ key: 'title', title: 'Task' }, { key: 'dueAt', title: 'Due', render: (row) => formatDateTime(row.dueAt) }, { key: 'status', title: 'Status' }]} data={handoffTasks} /> : <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No handoff tasks have been recorded.</p>}</Card>
                    )}
                </div>
            );
        };

        // ==========================================
        // WORKFORCE ANALYTICS MODULE
        // ==========================================
        const WorkforceModule = () => {
            const staff = appData.users || [];
            const activeStaff = staff.filter((user) => user.status === 'active');
            const completedTasks = (appData.clinicalTasks || []).filter((task) => task.status === 'completed').length;
            const openTasks = (appData.clinicalTasks || []).filter((task) => task.status === 'open' || task.status === 'in_progress').length;
            const productivityRate = activeStaff.length ? Math.round((completedTasks / activeStaff.length) * 100) : 0;
            const staffingCoverage = (appData.users || []).length
                ? [
                    { unit: 'Clinical Teams', scheduled: staff.length, actual: activeStaff.length, occupancy: Math.min(100, Math.round((activeStaff.length / Math.max(1, staff.length)) * 100)) }
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
                        <StatCard title="Completed tasks / staff" value={`${productivityRate}%`} icon={Icons.Activity} color="emerald" />
                        <StatCard title="Open clinical tasks" value={openTasks} icon={Icons.Calendar} color="amber" />
                        <StatCard title="Inactive profiles" value={staff.filter((user) => user.status !== 'active').length} icon={Icons.AlertCircle} color="red" />
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
                            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">No workforce risk feed is connected. Risks will appear here when roster and leave data are integrated.</p>
                        </Card>

                        <Card title="Roster Status">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><span className="text-sm text-slate-600">Active staff profiles</span><span className="text-sm font-semibold text-slate-900">{(appData.users || []).filter((user) => user.status === 'active').length}</span></div>
                                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><span className="text-sm text-slate-600">Inactive staff profiles</span><span className="text-sm font-semibold text-slate-900">{(appData.users || []).filter((user) => user.status !== 'active').length}</span></div>
                                <p className="text-xs text-slate-500">Shift, certification, leave, and overtime indicators require their respective live integrations.</p>
                            </div>
                        </Card>
                    </div>
                </div>
            );
        };

        // ==========================================
        // PHARMACY MODULE
        // ==========================================
        const PharmacyModule = ({ initialTab = 'dispensary' }) => {
            const [activeTab, setActiveTab] = useState(initialTab);
            const [searchQuery, setSearchQuery] = useState('');
            const [inventory, setInventory] = useState(getLiveStore().pharmacyInventory || []);
            const [showAddStock, setShowAddStock] = useState(false);
            const [stockForm, setStockForm] = useState({ name: '', genericName: '', category: 'General', stockQuantity: 0, reorderLevel: 0, unitPrice: 0, expiryDate: '', supplier: '' });

            useEffect(() => {
                setActiveTab(initialTab);
            }, [initialTab]);

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
            const inventoryValue = inventory.reduce(
                (total, item) => total + Math.max(0, Number(item.stockQuantity) || 0) * Math.max(0, Number(item.unitPrice) || 0),
                0
            );
            const expiringSoonCount = inventory.filter((item) => {
                if (!item.expiryDate) return false;
                const expiry = new Date(item.expiryDate);
                const today = new Date();
                const threeMonths = new Date(today);
                threeMonths.setMonth(threeMonths.getMonth() + 3);
                return !Number.isNaN(expiry.valueOf()) && expiry >= today && expiry <= threeMonths;
            }).length;

            const handleAddStock = async () => {
                if (!stockForm.name) return;
                const payload = {
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

                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('add inventory');
                const { data, error } = await client.from('pharmacy_inventory').insert([{
                    name: payload.name, generic_name: payload.genericName || null, category: payload.category || null,
                    stock_quantity: payload.stockQuantity, reorder_level: payload.reorderLevel,
                    unit_price: payload.unitPrice, expiry_date: payload.expiryDate || null,
                    supplier: payload.supplier || null, status: payload.status
                }]).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('add inventory', error);
                const mapped = { ...payload, id: data[0].id, genericName: data[0].generic_name || payload.genericName, stockQuantity: data[0].stock_quantity ?? payload.stockQuantity, reorderLevel: data[0].reorder_level ?? payload.reorderLevel, unitPrice: data[0].unit_price ?? payload.unitPrice, expiryDate: data[0].expiry_date || payload.expiryDate };
                const next = [...inventory, mapped];
                persistStoreTable('pharmacyInventory', next);
                setInventory(next);
                setShowAddStock(false);
                setStockForm({ name: '', genericName: '', category: 'General', stockQuantity: 0, reorderLevel: 0, unitPrice: 0, expiryDate: '', supplier: '' });
            };

            const handleDispense = async (prescription) => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('dispense medication');
                const { data, error } = await client.rpc('dispense_prescription', { p_prescription_id: prescription.id });
                if (error || !data?.items) return notifyPersistenceFailure('dispense medication', error || new Error('The dispensing transaction did not return a result.'));

                const dispensedByInventoryId = new Map(data.items.map((item) => [item.inventoryId, item]));
                const nextInventory = inventory.map((item) => {
                    const dispensedItem = dispensedByInventoryId.get(item.id);
                    return dispensedItem
                        ? { ...item, stockQuantity: dispensedItem.remainingStock, status: dispensedItem.status }
                        : item;
                });

                persistStoreTable('pharmacyInventory', nextInventory);
                setInventory(nextInventory);
                const nextPrescriptions = (appData.prescriptions || []).map((item) => item.id === prescription.id ? { ...item, status: 'dispensed' } : item);
                persistStoreTable('prescriptions', nextPrescriptions);
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
                        <StatCard title="Expiring Soon" value={expiringSoonCount} icon={Icons.Clock} color="red" />
                        <StatCard title="Inventory Value" value={formatCurrency(inventoryValue)} icon={Icons.DollarSign} color="emerald" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'dispensary' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card title="Pending Prescriptions" className="lg:col-span-2">
                                <DataTable
                                    columns={[
                                        { key: 'id', title: 'Rx ID', className: 'font-mono text-xs' },
                                        { key: 'patient', title: 'Patient', render: (row) => {
                                            const patient = appData.patients.find(p => p.id === row.patientId);
                                            return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                        }},
                                        { key: 'diagnosis', title: 'Diagnosis' },
                                        { key: 'medications', title: 'Items', render: (row) => row.medications.length },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge> }
                                    ]}
                                    data={appData.prescriptions.filter(p => p.status === 'active')}
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
                                        const patient = appData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'doctor', title: 'Doctor', render: (row) => {
                                        const doctor = appData.users.find(u => u.id === row.doctorId);
                                        return doctor?.name || 'Unknown';
                                    }},
                                    { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                    { key: 'diagnosis', title: 'Diagnosis' },
                                    { key: 'priority', title: 'Priority', render: (row) => <Badge variant={row.priority === 'emergency' ? 'danger' : row.priority === 'urgent' ? 'warning' : 'default'}>{row.priority || 'routine'}</Badge> },
                                    { key: 'medications', title: 'Medication orders', render: (row) => (row.medications || []).map((medication) => `${medication.name} × ${medication.quantity}`).join(', ') || 'No items' },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : row.status === 'dispensed' ? 'info' : 'default'}>{row.status}</Badge> }
                                ]}
                                data={appData.prescriptions}
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
            const { user } = useAuth();
            const [activeTab, setActiveTab] = useState(initialTab);
            const [showNewInvoice, setShowNewInvoice] = useState(false);
            const [showPaymentModal, setShowPaymentModal] = useState(false);
            const [showInsuranceModal, setShowInsuranceModal] = useState(false);
            const [invoices, setInvoices] = useState(getLiveStore().billing || []);
            const [insuranceFilter, setInsuranceFilter] = useState('all');
            const [invoiceForm, setInvoiceForm] = useState({ patientId: '', invoiceNumber: 'INV-' + Date.now(), total: 0, department: '', service: '', status: 'pending' });
            const [paymentForm, setPaymentForm] = useState({ invoiceId: '', amount: 0, method: 'Card', reference: '' });
            const [bankAccounts, setBankAccounts] = useState([]);
            const [claimForm, setClaimForm] = useState({ patientId: '', provider: '', claimNumber: 'CLM-' + Date.now(), amountClaimed: 0, amountApproved: 0, status: 'pending' });
            const [insuranceMemberships, setInsuranceMemberships] = useState([]);
            const [membershipForm, setMembershipForm] = useState({ patientId: '', provider: '', scheme: '', planName: '', policyNumber: '', principalMember: '', dependentRelationship: '', effectiveFrom: '', effectiveTo: '', copayment: '', deductible: '' });
            const [membershipMessage, setMembershipMessage] = useState('');
            const [verificationReferences, setVerificationReferences] = useState({});

            useEffect(() => {
                setActiveTab(initialTab);
            }, [initialTab]);

            useEffect(() => {
                let active = true;
                window.OneMedSupabase?.loadSystemSettings?.().then((settings) => {
                    if (active) setBankAccounts(Array.isArray(settings?.bankAccounts) ? settings.bankAccounts : []);
                }).catch(() => {});
                return () => { active = false; };
            }, []);

            useEffect(() => {
                if (activeTab !== 'memberships') return;
                window.OneMedSupabase?.getClient?.()?.from('insurance_memberships').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
                    if (error) setMembershipMessage(`Membership records unavailable: ${error.message}`);
                    else setInsuranceMemberships(data || []);
                });
            }, [activeTab]);

            const tabs = [
                { id: 'invoices', label: 'Invoices' },
                { id: 'payments', label: 'Payments' },
                { id: 'insurance', label: 'Insurance Claims' }
                ,{ id: 'memberships', label: 'Schemes & Eligibility' }
            ];

            const createInsuranceMembership = async () => {
                if (!membershipForm.patientId || !membershipForm.provider.trim() || !membershipForm.policyNumber.trim()) return setMembershipMessage('Patient, insurer, and policy number are required.');
                const { data, error } = await window.OneMedSupabase.getClient().from('insurance_memberships').insert({ patient_id: membershipForm.patientId, provider: membershipForm.provider.trim(), scheme: membershipForm.scheme.trim() || null, plan_name: membershipForm.planName.trim() || null, policy_number: membershipForm.policyNumber.trim(), principal_member: membershipForm.principalMember.trim() || null, dependent_relationship: membershipForm.dependentRelationship || null, effective_from: membershipForm.effectiveFrom || null, effective_to: membershipForm.effectiveTo || null, copayment: Number(membershipForm.copayment || 0), deductible: Number(membershipForm.deductible || 0), created_by: user?.id || null, coverage_status: 'pending', verification_status: 'pending_manual' }).select().single();
                if (error || !data) return setMembershipMessage(error?.message || 'Membership was not saved.');
                setInsuranceMemberships((items) => [data, ...items]);
                setMembershipForm({ patientId: '', provider: '', scheme: '', planName: '', policyNumber: '', principalMember: '', dependentRelationship: '', effectiveFrom: '', effectiveTo: '', copayment: '', deductible: '' });
                setMembershipMessage('Membership saved as pending manual verification.');
            };

            const recordManualEligibility = async (membership, status) => {
                const reference = verificationReferences[membership.id] || '';
                const client = window.OneMedSupabase.getClient();
                const { data: check, error: checkError } = await client.from('insurance_eligibility_checks').insert({ membership_id: membership.id, service_type: verificationReferences[`${membership.id}:service`] || 'general', status: status === 'verified_manual' ? 'eligible' : 'ineligible', reference: reference || null, notes: 'Manual verification recorded by authorized insurance staff.', checked_by: user?.id || null }).select().single();
                if (checkError || !check) return setMembershipMessage(checkError?.message || 'Eligibility result was not saved.');
                const { data, error } = await client.from('insurance_memberships').update({ verification_status: status, verification_reference: reference || null, verified_by: user?.id || null, verified_at: new Date().toISOString(), coverage_status: status === 'verified_manual' ? 'active' : 'rejected' }).eq('id', membership.id).select().single();
                if (error || !data) return setMembershipMessage(error?.message || 'Membership status could not be updated.');
                setInsuranceMemberships((items) => items.map((item) => item.id === membership.id ? data : item));
                setMembershipMessage(status === 'verified_manual' ? 'Manual eligibility check recorded as verified.' : 'Manual eligibility check recorded as ineligible.');
            };

            const handleCreateInvoice = async () => {
                if (!invoiceForm.patientId) return;
                const payload = {
                    patientId: invoiceForm.patientId,
                    invoiceNumber: invoiceForm.invoiceNumber || 'INV-' + Date.now(),
                    date: new Date().toISOString().split('T')[0],
                    subtotal: Number(invoiceForm.total || 0),
                    discount: 0,
                    tax: 0,
                    total: Number(invoiceForm.total || 0),
                    paid: 0,
                    balance: Math.max(0, Number(invoiceForm.total || 0)),
                    department: invoiceForm.department.trim(),
                    service: invoiceForm.service.trim(),
                    paymentMethod: 'cash',
                    status: 'pending'
                };

                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('create invoice');
                const { data, error } = await client.from('billing').insert([{
                    patient_id: payload.patientId, invoice_number: payload.invoiceNumber, invoice_date: payload.date,
                    subtotal: payload.subtotal, discount: payload.discount, tax: payload.tax, total: payload.total,
                    paid: 0, balance: payload.balance, department: payload.department || null, service: payload.service || null, payment_method: null, status: 'pending'
                }]).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('create invoice', error);
                const mapped = { ...payload, id: data[0].id, patientId: data[0].patient_id || payload.patientId, invoiceNumber: data[0].invoice_number || payload.invoiceNumber, date: data[0].invoice_date || payload.date, paymentMethod: data[0].payment_method || payload.paymentMethod };
                const next = [...invoices, mapped];
                persistStoreTable('billing', next);
                setInvoices(next);
                setShowNewInvoice(false);
                setInvoiceForm({ patientId: '', invoiceNumber: 'INV-' + Date.now(), total: 0, department: '', service: '', status: 'pending' });
            };

            const handleProcessPayment = async () => {
                if (!paymentForm.invoiceId || !Number(paymentForm.amount || 0)) return;
                const client = window.OneMedSupabase?.getClient?.();
                const invoice = invoices.find(row => row.id === paymentForm.invoiceId);
                const amount = Number(paymentForm.amount || 0);
                if (!client || !invoice || amount <= 0 || amount > Number(invoice.balance || 0)) return notifyPersistenceFailure('submit payment for approval');
                const { error } = await client.from('payment_submissions').insert({ billing_id: invoice.id, patient_id: invoice.patientId, amount, payment_method: paymentForm.method, reference: paymentForm.reference || null, status: 'pending' });
                if (error) return notifyPersistenceFailure('process payment', error);
                window.dispatchEvent(new CustomEvent('onemed:refresh-data'));
                setShowPaymentModal(false);
                setPaymentForm({ invoiceId: '', amount: 0, method: 'Card', reference: '' });
            };

            const handleAdvanceClaim = async (claimId) => {
                const queue = ['pending', 'under_review', 'approved', 'paid'];
                const nextClaims = (appData.insuranceClaims || []).map((claim) => {
                    if (claim.id !== claimId) return claim;
                    const currentIndex = queue.indexOf(claim.status || 'pending');
                    const nextStatus = queue[Math.min(queue.length - 1, currentIndex + 1)] || 'pending';
                    return { ...claim, status: nextStatus, amountApproved: Number(claim.amountApproved || 0) || Number(claim.amountClaimed || 0) };
                });
                const changed = nextClaims.find(claim => claim.id === claimId);
                const client = window.OneMedSupabase?.getClient?.();
                if (!client || !changed) return notifyPersistenceFailure('advance insurance claim');
                const { error } = await client.from('insurance_claims').update({ status: changed.status, amount_approved: changed.amountApproved }).eq('id', claimId);
                if (error) return notifyPersistenceFailure('advance insurance claim', error);
                persistStoreTable('insuranceClaims', nextClaims);
                appData.insuranceClaims = nextClaims;
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
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('submit insurance claim');
                const { data, error } = await client.from('insurance_claims').insert({ patient_id: nextClaim.patientId, claim_number: nextClaim.claimNumber, provider: nextClaim.provider, amount_claimed: nextClaim.amountClaimed, amount_approved: nextClaim.amountApproved, status: nextClaim.status }).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('submit insurance claim', error);
                const savedClaim = normalizeInsuranceClaims(data)[0];
                const next = [...(appData.insuranceClaims || []), savedClaim];
                persistStoreTable('insuranceClaims', next);
                appData.insuranceClaims = next;
                setShowInsuranceModal(false);
                setClaimForm({ patientId: '', provider: '', claimNumber: 'CLM-' + Date.now(), amountClaimed: 0, amountApproved: 0, status: 'pending' });
            };

            const totalRevenue = invoices.reduce((s, b) => s + parseFloat(b.total || 0), 0);
            const totalCollected = invoices.reduce((s, b) => s + parseFloat(b.paid || 0), 0);
            const totalOutstanding = invoices.reduce((s, b) => s + parseFloat(b.balance || 0), 0);
            const insuranceClaims = appData.insuranceClaims || [];
            const pendingClaims = insuranceClaims.filter(c => c.status === 'pending' || c.status === 'under_review').length;
            const approvedClaims = insuranceClaims.filter(c => c.status === 'approved' || c.status === 'paid').length;
            const deniedClaims = insuranceClaims.filter(c => c.status === 'denied').length;
            const claimApprovalRate = insuranceClaims.length ? Math.round((approvedClaims / insuranceClaims.length) * 100) : 0;
            const allowedInsurance = insuranceClaims.reduce((s, claim) => s + Number(claim.amountApproved || 0), 0);
            const invoiceAgeInDays = (invoice) => {
                const issued = new Date(invoice.date);
                return Number.isNaN(issued.valueOf()) ? 0 : Math.max(0, Math.floor((Date.now() - issued.valueOf()) / 86400000));
            };
            const outstandingInvoices = invoices.filter((invoice) => Number(invoice.balance || 0) > 0);
            const agingSummary = [
                { label: 'Current', value: outstandingInvoices.filter((invoice) => invoiceAgeInDays(invoice) <= 30).length },
                { label: '31-60 days', value: outstandingInvoices.filter((invoice) => invoiceAgeInDays(invoice) > 30 && invoiceAgeInDays(invoice) <= 60).length },
                { label: '61-90 days', value: outstandingInvoices.filter((invoice) => invoiceAgeInDays(invoice) > 60 && invoiceAgeInDays(invoice) <= 90).length },
                { label: '90+ days', value: outstandingInvoices.filter((invoice) => invoiceAgeInDays(invoice) > 90).length }
            ];
            const invoiceStatusData = Object.entries(invoices.reduce((counts, invoice) => {
                const status = invoice.status || 'unknown';
                counts[status] = (counts[status] || 0) + Number(invoice.total || 0);
                return counts;
            }, {})).map(([label, value]) => ({ label, value }));

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
                        <StatCard title="Pending Claims" value={pendingClaims} icon={Icons.Shield} color="violet" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'invoices' && (
                        <Card>
                            <DataTable
                                columns={[
                                    { key: 'invoiceNumber', title: 'Invoice', className: 'font-mono text-xs' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = appData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'paid' ? 'success' : row.status === 'partial' ? 'warning' : row.status === 'overdue' ? 'danger' : 'default'}>{row.status}</Badge> }
                                ]}
                                data={invoices}
                                actions={(row) => (
                                    <>
                                        <Button variant="secondary" size="sm" onClick={() => { setPaymentForm({ invoiceId: row.id, amount: Math.max(0, Number(row.balance || 0)), method: 'Card', reference: '' }); setShowPaymentModal(true); }}>Post Payment</Button>
                                    </>
                                )}
                            />
                        </Card>
                    )}

                    {activeTab === 'payments' && (
                        <Card title="Payments awaiting Accounts approval">
                            <DataTable
                                columns={[
                                    { key: 'invoiceNumber', title: 'Invoice' },
                                    { key: 'patient', title: 'Patient', render: (row) => appData.patients.find(p => p.id === row.patientId)?.firstName + ' ' + (appData.patients.find(p => p.id === row.patientId)?.lastName || 'Unknown') },
                                    { key: 'amount', title: 'Amount', render: (row) => formatCurrency(row.amount) },
                                    { key: 'paymentMethod', title: 'Method' },
                                    { key: 'reference', title: 'Reference' },
                                    { key: 'status', title: 'Status', render: row => <Badge variant={row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'}>{row.status}</Badge> },
                                    { key: 'date', title: 'Date', render: (row) => formatDate(row.createdAt) },
                                    { key: 'actions', title: 'Accounts review', render: row => row.status === 'pending' && ['accountant', 'super_admin'].includes(user?.role) ? <div className="flex gap-2"><Button size="sm" variant="primary" onClick={async () => { const { error } = await window.OneMedSupabase.getClient().rpc('review_payment_submission', { p_payment_id: row.id, p_decision: 'approved' }); if (error) notifyPersistenceFailure('approve payment', error); else window.dispatchEvent(new CustomEvent('onemed:refresh-data')); }}>Approve</Button><Button size="sm" variant="danger" onClick={async () => { const { error } = await window.OneMedSupabase.getClient().rpc('review_payment_submission', { p_payment_id: row.id, p_decision: 'rejected' }); if (error) notifyPersistenceFailure('reject payment', error); else window.dispatchEvent(new CustomEvent('onemed:refresh-data')); }}>Reject</Button></div> : null }
                                ]}
                                data={(appData.paymentSubmissions || []).map(payment => ({ ...payment, invoiceNumber: invoices.find(invoice => invoice.id === payment.invoiceId)?.invoiceNumber || 'Invoice unavailable' }))}
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
                                            const patient = appData.patients.find(p => p.id === row.patientId);
                                            return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                        }},
                                        { key: 'provider', title: 'Provider' },
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

                    {activeTab === 'memberships' && (
                        <div className="space-y-6">
                            <Card title="Record insurance membership" subtitle="Coverage remains pending until eligibility is checked with the insurer. Emergency care must follow facility policy regardless of verification state.">
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                    <Select label="Patient" value={membershipForm.patientId} onChange={(event) => setMembershipForm((form) => ({...form,patientId:event.target.value}))} options={[{value:'',label:'Select patient...'},...(appData.patients || []).map((patient) => ({value:patient.id,label:`${patient.firstName} ${patient.lastName}`}))]} />
                                    <Input label="Insurer/provider" value={membershipForm.provider} onChange={(event) => setMembershipForm((form) => ({...form,provider:event.target.value}))} />
                                    <Input label="Scheme" value={membershipForm.scheme} onChange={(event) => setMembershipForm((form) => ({...form,scheme:event.target.value}))} />
                                    <Input label="Plan" value={membershipForm.planName} onChange={(event) => setMembershipForm((form) => ({...form,planName:event.target.value}))} />
                                    <Input label="Policy / membership number" value={membershipForm.policyNumber} onChange={(event) => setMembershipForm((form) => ({...form,policyNumber:event.target.value}))} />
                                    <Input label="Principal member" value={membershipForm.principalMember} onChange={(event) => setMembershipForm((form) => ({...form,principalMember:event.target.value}))} />
                                    <Select label="Dependent relationship" value={membershipForm.dependentRelationship} onChange={(event) => setMembershipForm((form) => ({...form,dependentRelationship:event.target.value}))} options={[{value:'',label:'Principal / unspecified'},...['spouse','child','parent','other'].map((value) => ({value,label:value}))]} />
                                    <Input label="Effective from" type="date" value={membershipForm.effectiveFrom} onChange={(event) => setMembershipForm((form) => ({...form,effectiveFrom:event.target.value}))} />
                                    <Input label="Effective to" type="date" value={membershipForm.effectiveTo} onChange={(event) => setMembershipForm((form) => ({...form,effectiveTo:event.target.value}))} />
                                    <Input label="Co-payment" type="number" min="0" value={membershipForm.copayment} onChange={(event) => setMembershipForm((form) => ({...form,copayment:event.target.value}))} />
                                    <Input label="Deductible" type="number" min="0" value={membershipForm.deductible} onChange={(event) => setMembershipForm((form) => ({...form,deductible:event.target.value}))} />
                                    <div className="flex items-end"><Button variant="primary" onClick={createInsuranceMembership}>Save membership</Button></div>
                                </div>
                                {membershipMessage && <p className="mt-3 text-sm text-slate-700" role="status">{membershipMessage}</p>}
                            </Card>
                            <Card title="Membership and manual eligibility queue">
                                {insuranceMemberships.length ? <div className="divide-y divide-slate-100">{insuranceMemberships.map((membership) => {
                                    const patient = (appData.patients || []).find((item) => item.id === membership.patient_id);
                                    return <div key={membership.id} className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_2fr] gap-3 py-4 items-center"><div><p className="font-semibold text-slate-900">{patient ? `${patient.firstName} ${patient.lastName}` : 'Patient record unavailable'}</p><p className="text-sm text-slate-600">{membership.provider} · {membership.scheme || 'Scheme not specified'} · {membership.policy_number}</p><p className="text-xs text-slate-500">{membership.plan_name || 'No plan'} · {membership.dependent_relationship || 'Principal/unspecified'} · {membership.effective_from || 'Start unknown'} to {membership.effective_to || 'No end date'}</p></div><div><Badge variant={membership.verification_status === 'verified_manual' ? 'success' : membership.verification_status === 'rejected_manual' ? 'danger' : 'warning'}>{membership.verification_status}</Badge><p className="mt-1 text-xs text-slate-500">Manual verification only · {membership.verification_reference || 'No reference'}</p></div><div className="flex flex-wrap items-end gap-2"><Select label="Service" value={verificationReferences[`${membership.id}:service`] || 'general'} onChange={(event) => setVerificationReferences((values) => ({...values,[`${membership.id}:service`]:event.target.value}))} options={['general','consultation','pharmacy','laboratory','surgery','inpatient'].map((value) => ({value,label:value}))} /><Input label="Insurer reference" value={verificationReferences[membership.id] || ''} onChange={(event) => setVerificationReferences((values) => ({...values,[membership.id]:event.target.value}))} /><Button size="sm" variant="primary" onClick={() => recordManualEligibility(membership,'verified_manual')}>Record eligible</Button><Button size="sm" variant="danger" onClick={() => recordManualEligibility(membership,'rejected_manual')}>Record ineligible</Button></div></div>;
                                })}</div> : <p className="text-sm text-slate-500">No insurance memberships have been recorded.</p>}
                                <p className="mt-3 text-xs text-slate-500">Results entered here are staff-recorded manual checks; no external insurer integration is configured.</p>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'reports' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Revenue by Department">
                                {invoiceStatusData.length ? <BarChart data={invoiceStatusData} width={500} height={250} color="#2563eb" /> : <p className="py-16 text-center text-sm text-slate-500">No invoice records are available yet.</p>}
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
                            <Select label="Patient" value={invoiceForm.patientId} onChange={(e) => setInvoiceForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(getLiveStore().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Input label="Invoice Number" value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm(prev => ({ ...prev, invoiceNumber: e.target.value }))} />
                            <Input label="Total Amount" type="number" value={invoiceForm.total} onChange={(e) => setInvoiceForm(prev => ({ ...prev, total: e.target.value }))} />
                            <Input label="Department" value={invoiceForm.department} onChange={(e) => setInvoiceForm(prev => ({ ...prev, department: e.target.value }))} />
                            <Input label="Service" value={invoiceForm.service} onChange={(e) => setInvoiceForm(prev => ({ ...prev, service: e.target.value }))} />
                        </div>
                    </Modal>

                    <Modal
                        isOpen={showPaymentModal}
                        onClose={() => setShowPaymentModal(false)}
                        title="Submit payment for Accounts approval"
                        size="sm"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowPaymentModal(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.CheckCircle} onClick={handleProcessPayment}>Submit for approval</Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <Select label="Payment method" value={paymentForm.method} onChange={(e) => setPaymentForm(prev => ({ ...prev, method: e.target.value }))} options={[{ value: 'Card', label: 'Card' }, { value: 'Cash', label: 'Cash' }, { value: 'Bank Transfer', label: 'Bank Transfer' }, { value: 'Insurance', label: 'Insurance' }]} />
                            {paymentForm.method === 'Bank Transfer' && (
                                <div className="rounded-lg border border-medical-200 bg-medical-50 p-3 text-sm text-medical-900">
                                    <p className="font-medium">Pay into a verified hospital account</p>
                                    {bankAccounts.length ? bankAccounts.map((account) => <p key={account.accountNumber} className="mt-1">{account.bankName} · {account.accountName} · {account.accountNumber}</p>) : <p className="mt-1 text-amber-700">No verified account has been configured. Ask a Super Admin before accepting a transfer.</p>}
                                </div>
                            )}
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
                            <Select label="Patient" value={claimForm.patientId} onChange={(e) => setClaimForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(getLiveStore().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Input label="Provider" value={claimForm.provider} onChange={(e) => setClaimForm(prev => ({ ...prev, provider: e.target.value }))} />
                            <Input label="Claim Number" value={claimForm.claimNumber} onChange={(e) => setClaimForm(prev => ({ ...prev, claimNumber: e.target.value }))} />
                            <Input label="Amount Claimed" type="number" value={claimForm.amountClaimed} onChange={(e) => setClaimForm(prev => ({ ...prev, amountClaimed: e.target.value }))} />
                            <Input label="Amount Approved" type="number" value={claimForm.amountApproved} onChange={(e) => setClaimForm(prev => ({ ...prev, amountApproved: e.target.value }))} />
                        </div>
                    </Modal>

                </div>
            );
        };

        // ==========================================
        // ADMISSIONS / WARD MODULE
        // ==========================================
        const AdmissionsModule = () => {
            const { user } = useAuth();
            const [selectedWard, setSelectedWard] = useState(null);
            const [showNewAdmission, setShowNewAdmission] = useState(false);
            const [admissions, setAdmissions] = useState(getLiveStore().admissions || []);
            const [admissionForm, setAdmissionForm] = useState({ patientId: '', encounterId: '', wardId: '', doctorId: user?.id || '', diagnosis: '', acuity: 'stable', priority: 'routine' });
            const [dispositionAdmission, setDispositionAdmission] = useState(null);
            const [allocationAdmission, setAllocationAdmission] = useState(null);
            const [allocationBedId, setAllocationBedId] = useState('');
            const [dispositionForm, setDispositionForm] = useState({ type: 'discharged', summary: '', instructions: '' });
            const [workflowError, setWorkflowError] = useState('');

            const handleCreateAdmission = async () => {
                if (!admissionForm.patientId || !admissionForm.diagnosis.trim()) return setWorkflowError('Select a patient and enter the clinical admission indication.');
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('admit patient');
                const { error } = await client.rpc('request_inpatient_admission', { p_patient_id: admissionForm.patientId, p_encounter_id: admissionForm.encounterId || null, p_doctor_id: admissionForm.doctorId || user?.id || null, p_ward_id: admissionForm.wardId || null, p_diagnosis: admissionForm.diagnosis.trim(), p_acuity: admissionForm.acuity, p_priority: admissionForm.priority });
                if (error) return setWorkflowError(error.message || 'The admission request could not be saved.');
                window.dispatchEvent(new CustomEvent('onemed:refresh-data'));
                setWorkflowError('');
                setShowNewAdmission(false);
                setAdmissionForm({ patientId: '', encounterId: '', wardId: '', doctorId: user?.id || '', diagnosis: '', acuity: 'stable', priority: 'routine' });
            };

            const allocateRequestedBed = async () => {
                if (!allocationAdmission || !allocationBedId) return setWorkflowError('Choose an available bed to allocate.');
                const { error } = await window.OneMedSupabase.getClient().rpc('allocate_requested_admission', { p_admission_id: allocationAdmission.id, p_bed_id: allocationBedId });
                if (error) return setWorkflowError(error.message || 'Bed allocation failed. The bed may have been allocated by another staff member.');
                setAllocationAdmission(null); setAllocationBedId(''); setWorkflowError(''); window.dispatchEvent(new CustomEvent('onemed:refresh-data'));
            };

            const completeDisposition = async () => {
                if (!dispositionAdmission || !dispositionForm.summary.trim()) return setWorkflowError('A discharge or transfer summary is required.');
                const { error } = await window.OneMedSupabase.getClient().rpc('complete_inpatient_disposition', { p_admission_id: dispositionAdmission.id, p_disposition: dispositionForm.type, p_summary: dispositionForm.summary.trim(), p_instructions: dispositionForm.instructions.trim() || null });
                if (error) return setWorkflowError(error.message || 'The inpatient disposition was not saved.');
                setDispositionAdmission(null); setDispositionForm({ type: 'discharged', summary: '', instructions: '' }); setWorkflowError('');
                window.dispatchEvent(new CustomEvent('onemed:refresh-data'));
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Ward Management</h2>
                            <p className="text-slate-500 mt-1">Admission requests, ward review, bed allocation, and discharge coordination</p>
                        </div>
                        {['doctor','super_admin'].includes(user?.role) && <Button variant="primary" icon={Icons.Plus} onClick={() => setShowNewAdmission(true)}>Request Admission</Button>}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {(appData.wards || []).map(ward => (
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
                                    <p className="text-xs text-slate-500">{ward.capacity ? Math.round((ward.occupied / ward.capacity) * 100) : 0}% occupied</p>
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
                                    const patient = appData.patients.find(p => p.id === row.patientId);
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
                                    const doctor = appData.users.find(u => u.id === row.doctorId);
                                    return doctor?.name || 'Unknown';
                                }},
                                { key: 'acuity', title: 'Acuity', render: (row) => <Badge variant={row.acuity === 'critical' ? 'danger' : row.acuity === 'moderate' ? 'warning' : 'success'}>{row.acuity}</Badge> }
                            ]}
                            data={admissions.filter(a => a.status === 'active')}
                            actions={(row) => ['super_admin','doctor','nurse'].includes(user?.role) ? <Button variant="secondary" size="sm" onClick={() => { setWorkflowError(''); setDispositionForm({type:user?.role==='nurse'?'transferred':'discharged',summary:'',instructions:''}); setDispositionAdmission(row); }}>{user?.role==='nurse'?'Transfer':'Discharge / Transfer'}</Button> : null}
                        />
                    </Card>
                    {['doctor','nurse','super_admin'].includes(user?.role) && <Card title="Admission requests awaiting bed allocation"><DataTable columns={[{key:'patientId',title:'Patient',render:(row)=>{const patient=appData.patients.find((item)=>item.id===row.patientId);return patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown';}},{key:'ward',title:'Requested ward'},{key:'diagnosis',title:'Admission indication'},{key:'admissionPriority',title:'Priority'},{key:'createdAt',title:'Requested',render:(row)=>formatDateTime(row.createdAt)}]} data={admissions.filter((row)=>row.status==='awaiting_bed')} actions={(row)=>['nurse','super_admin'].includes(user?.role) ? <Button size="sm" variant="primary" onClick={()=>{setWorkflowError('');setAllocationAdmission(row);setAllocationBedId('');}}>Allocate available bed</Button> : null} /></Card>}

                    <Modal
                        isOpen={showNewAdmission}
                        onClose={() => setShowNewAdmission(false)}
                        title="New Admission"
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowNewAdmission(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleCreateAdmission}>Submit Admission Request</Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <Select label="Patient" value={admissionForm.patientId} onChange={(e) => setAdmissionForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(getLiveStore().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Select label="Requested ward" value={admissionForm.wardId} onChange={(e) => setAdmissionForm(prev => ({ ...prev, wardId: e.target.value, bedId: '' }))} options={[{ value: '', label: 'Select ward...' }, ...(appData.wards || []).filter((ward) => ward.status === 'active').map((ward) => ({ value: ward.id, label: ward.name }))]} />
                            <Select label="Active encounter" value={admissionForm.encounterId} onChange={(e) => setAdmissionForm(prev => ({ ...prev, encounterId: e.target.value }))} options={[{ value: '', label: 'No encounter selected' }, ...(appData.encounters || []).filter((encounter) => encounter.patientId === admissionForm.patientId && !encounter.endedAt).map((encounter) => ({ value: encounter.id, label: `${encounter.encounterType} · ${encounter.reasonForVisit}` }))]} />
                            <Select label="Doctor" value={admissionForm.doctorId} onChange={(e) => setAdmissionForm(prev => ({ ...prev, doctorId: e.target.value }))} options={[{ value: '', label: 'Unassigned' }, ...(appData.users || []).filter(user => user.role === 'doctor').map(user => ({ value: user.id, label: user.name }))]} />
                            <Input label="Diagnosis" value={admissionForm.diagnosis} onChange={(e) => setAdmissionForm(prev => ({ ...prev, diagnosis: e.target.value }))} />
                            <Select label="Admission priority" value={admissionForm.priority} onChange={(e) => setAdmissionForm(prev => ({ ...prev, priority: e.target.value }))} options={['routine','urgent','emergency'].map((value) => ({value,label:value}))} />
                            <Select label="Acuity" value={admissionForm.acuity} onChange={(e) => setAdmissionForm(prev => ({ ...prev, acuity: e.target.value }))} options={[{ value: 'stable', label: 'Stable' }, { value: 'moderate', label: 'Moderate' }, { value: 'critical', label: 'Critical' }]} />
                            {workflowError && <p className="text-sm text-red-700" role="alert">{workflowError}</p>}
                        </div>
                    </Modal>

                    <Modal isOpen={!!allocationAdmission} onClose={()=>setAllocationAdmission(null)} title="Allocate ward bed" size="md" footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={()=>setAllocationAdmission(null)}>Cancel</Button><Button variant="primary" onClick={allocateRequestedBed}>Allocate bed</Button></div>}><div className="space-y-4"><p className="text-sm text-slate-600">Requested ward: {allocationAdmission?.ward || 'Any available ward'}</p><Select label="Available bed" value={allocationBedId} onChange={(event)=>setAllocationBedId(event.target.value)} options={[{value:'',label:'Select an available bed'},...(appData.beds || []).filter((bed)=>bed.status==='available' && (!allocationAdmission?.requested_ward_id || bed.wardId===allocationAdmission.requested_ward_id)).map((bed)=>({value:bed.id,label:`${(appData.wards || []).find((ward)=>ward.id===bed.wardId)?.name || 'Ward'} · ${bed.bedNumber}`}))]} />{workflowError && <p className="text-sm text-red-700" role="alert">{workflowError}</p>}</div></Modal>

                    <Modal isOpen={!!dispositionAdmission} onClose={() => setDispositionAdmission(null)} title="Complete inpatient disposition" size="md" footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setDispositionAdmission(null)}>Cancel</Button><Button variant="primary" onClick={completeDisposition}>Complete disposition</Button></div>}>
                        <div className="space-y-4"><Select label="Disposition" value={dispositionForm.type} onChange={(event) => setDispositionForm((value) => ({ ...value, type: event.target.value }))} options={user?.role==='nurse' ? [{value:'transferred',label:'Transferred'}] : [{value:'discharged',label:'Discharged'}, {value:'transferred',label:'Transferred'}]} /><TextArea label="Discharge or transfer summary" value={dispositionForm.summary} onChange={(event) => setDispositionForm((value) => ({ ...value, summary: event.target.value }))} rows={4} /><TextArea label="Patient instructions and follow-up" value={dispositionForm.instructions} onChange={(event) => setDispositionForm((value) => ({ ...value, instructions: event.target.value }))} rows={3} />{workflowError && <p className="text-sm text-red-700" role="alert">{workflowError}</p>}</div>
                    </Modal>

                    <Modal
                        isOpen={!!selectedWard}
                        onClose={() => setSelectedWard(null)}
                        title={(selectedWard?.name || '') + ' - Bed Map'}
                        size="lg"
                    >
                        {selectedWard && (
                            <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                                {(appData.beds || []).filter(b => b.wardId === selectedWard.id).map(bed => (
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
            const { user } = useAuth();
            const [showSchedule, setShowSchedule] = useState(false);
            const [surgeries, setSurgeries] = useState(getLiveStore().surgeries || []);
            const [surgeryForm, setSurgeryForm] = useState({ patientId: '', encounterId: '', surgeonId: '', procedure: '', indication: '', diagnosis: '', scheduledDate: '', scheduledTime: '', duration: '', otRoom: '', anesthesia: '', priority: 'elective' });
            const [selectedSurgery, setSelectedSurgery] = useState(null);
            const [surgeryUpdate, setSurgeryUpdate] = useState({ status: 'accepted', reviewReason: '', consentStatus: 'pending', preoperativeNotes: '', operativeNotes: '', postoperativePlan: '', complications: '', scheduledDate: '', scheduledTime: '', otRoom: '' });
            const [surgeryMessage, setSurgeryMessage] = useState('');

            const handleScheduleSurgery = async () => {
                if (!surgeryForm.patientId || !surgeryForm.procedure.trim() || !surgeryForm.indication.trim() || !surgeryForm.diagnosis.trim() || (surgeryForm.priority === 'elective' && !surgeryForm.scheduledDate)) return setSurgeryMessage('Patient, indication, diagnosis, procedure, and elective date are required.');

                const payload = {
                    patientId: surgeryForm.patientId,
                    surgeonId: surgeryForm.surgeonId,
                    procedure: surgeryForm.procedure,
                    scheduledDate: surgeryForm.scheduledDate,
                    scheduledTime: surgeryForm.scheduledTime,
                    duration: surgeryForm.duration || null,
                    status: 'requested',
                    otRoom: surgeryForm.otRoom,
                    anesthesia: surgeryForm.anesthesia,
                    priority: surgeryForm.priority,
                    indication: surgeryForm.indication,
                    diagnosis: surgeryForm.diagnosis,
                    encounterId: surgeryForm.encounterId
                };

                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return notifyPersistenceFailure('schedule surgery');
                const { data, error } = await client.from('surgeries').insert([{
                    patient_id: payload.patientId, surgeon_id: payload.surgeonId || null, procedure: payload.procedure,
                    scheduled_date: payload.scheduledDate || new Date().toISOString().slice(0, 10), scheduled_time: payload.scheduledTime || null,
                    duration: payload.duration, status: payload.status, ot_room: payload.otRoom || null,
                    anesthesia: payload.anesthesia || null, priority: payload.priority, indication: payload.indication,
                    diagnosis: payload.diagnosis, encounter_id: payload.encounterId || null, requesting_clinician_id: user?.id || null
                }]).select();
                if (error || !data?.[0]) return notifyPersistenceFailure('schedule surgery', error);
                const mapped = { ...payload, id: data[0].id, patientId: data[0].patient_id || payload.patientId, surgeonId: data[0].surgeon_id || payload.surgeonId, scheduledDate: data[0].scheduled_date || payload.scheduledDate, scheduledTime: data[0].scheduled_time || payload.scheduledTime, otRoom: data[0].ot_room || payload.otRoom };
                const next = [...surgeries, mapped];
                persistStoreTable('surgeries', next);
                setSurgeries(next);
                setShowSchedule(false);
                setSurgeryForm({ patientId: '', encounterId: '', surgeonId: '', procedure: '', indication: '', diagnosis: '', scheduledDate: '', scheduledTime: '', duration: '', otRoom: '', anesthesia: '', priority: 'elective' });
            };

            const saveSurgeryReview = async () => {
                if (!selectedSurgery) return;
                if (['scheduled','in-progress'].includes(surgeryUpdate.status) && surgeryUpdate.consentStatus !== 'documented' && selectedSurgery.priority !== 'emergency') return setSurgeryMessage('Document consent before scheduling or starting elective surgery.');
                if (surgeryUpdate.status === 'completed' && (!surgeryUpdate.operativeNotes.trim() || !surgeryUpdate.postoperativePlan.trim())) return setSurgeryMessage('Operative notes and a postoperative plan are required before completion.');
                if (surgeryUpdate.status === 'scheduled' && (!surgeryUpdate.scheduledDate || !surgeryUpdate.scheduledTime || !surgeryUpdate.otRoom)) return setSurgeryMessage('Choose a date, time, and theatre room before scheduling.');
                if (surgeryUpdate.status === 'deferred' || surgeryUpdate.status === 'rejected') if (!surgeryUpdate.reviewReason.trim()) return setSurgeryMessage('A reason is required to defer or reject a request.');
                const patch = { status: surgeryUpdate.status, review_reason: surgeryUpdate.reviewReason.trim() || null, consent_status: surgeryUpdate.consentStatus, preoperative_notes: surgeryUpdate.preoperativeNotes.trim() || null, operative_notes: surgeryUpdate.operativeNotes.trim() || null, postoperative_plan: surgeryUpdate.postoperativePlan.trim() || null, complications: surgeryUpdate.complications.trim() || null, scheduled_date: surgeryUpdate.scheduledDate || selectedSurgery.scheduledDate, scheduled_time: surgeryUpdate.scheduledTime || null, ot_room: surgeryUpdate.otRoom || null };
                if (surgeryUpdate.status === 'in-progress' && !selectedSurgery.startedAt) patch.started_at = new Date().toISOString();
                if (surgeryUpdate.status === 'completed') patch.ended_at = new Date().toISOString();
                const { data, error } = await window.OneMedSupabase.getClient().from('surgeries').update(patch).eq('id', selectedSurgery.id).select().single();
                if (error || !data) return setSurgeryMessage(error?.message || 'Surgery workflow update failed.');
                const updated = normalizeSurgeries([data])[0];
                setSurgeries((items) => items.map((item) => item.id === updated.id ? updated : item));
                setSelectedSurgery(null); setSurgeryMessage('');
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Operating Theatre</h2>
                            <p className="text-slate-500 mt-1">Surgery scheduling and management</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus} onClick={() => {setSurgeryMessage('');setShowSchedule(true);}}>Request Surgery</Button>
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
                                        const patient = appData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'surgeon', title: 'Surgeon', render: (row) => {
                                        const surgeon = appData.users.find(u => u.id === row.surgeonId);
                                        return surgeon?.name || 'Unknown';
                                    }},
                                    { key: 'duration', title: 'Duration', render: (row) => row.duration || 'Not specified' },
                                    { key: 'otRoom', title: 'OT Room' },
                                    { key: 'priority', title: 'Priority', render: (row) => <Badge variant={row.priority === 'emergency' ? 'danger' : row.priority === 'urgent' ? 'warning' : 'default'}>{row.priority}</Badge> },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'in-progress' ? 'info' : row.status === 'emergency_escalated' ? 'danger' : 'default'}>{row.status}</Badge> }
                                ]}
                                data={[...surgeries].sort((a, b) => ({emergency:0,urgent:1,elective:2}[a.priority] ?? 3) - ({emergency:0,urgent:1,elective:2}[b.priority] ?? 3) || (a.scheduledTime || '').localeCompare(b.scheduledTime || ''))}
                                actions={(row) => <Button variant="primary" size="sm" onClick={() => {setSurgeryMessage('');setSelectedSurgery(row);setSurgeryUpdate({status:row.status === 'requested' ? 'accepted' : row.status,reviewReason:row.reviewReason || '',consentStatus:row.consentStatus || 'pending',preoperativeNotes:row.preoperativeNotes || '',operativeNotes:row.operativeNotes || '',postoperativePlan:row.postoperativePlan || '',complications:row.complications || '',scheduledDate:row.scheduledDate || '',scheduledTime:row.scheduledTime || '',otRoom:row.otRoom || ''});}}>Review / Document</Button>}
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
                            <Select label="Patient" value={surgeryForm.patientId} onChange={(e) => setSurgeryForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(getLiveStore().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Select label="Encounter" value={surgeryForm.encounterId} onChange={(e) => setSurgeryForm(prev => ({ ...prev, encounterId: e.target.value }))} options={[{value:'',label:'Optional encounter'},...(appData.encounters || []).filter((encounter) => encounter.patientId === surgeryForm.patientId && !encounter.endedAt).map((encounter) => ({value:encounter.id,label:`${encounter.encounterType} · ${encounter.reasonForVisit}`}))]} />
                            <Select label="Surgeon" value={surgeryForm.surgeonId} onChange={(e) => setSurgeryForm(prev => ({ ...prev, surgeonId: e.target.value }))} options={[{ value: '', label: 'Unassigned' }, ...(appData.users || []).filter(user => user.role === 'doctor').map(user => ({ value: user.id, label: user.name }))]} />
                            <Input label="Procedure" value={surgeryForm.procedure} onChange={(e) => setSurgeryForm(prev => ({ ...prev, procedure: e.target.value }))} />
                            <Input label="Indication" value={surgeryForm.indication} onChange={(e) => setSurgeryForm(prev => ({ ...prev, indication: e.target.value }))} />
                            <Input label="Diagnosis" value={surgeryForm.diagnosis} onChange={(e) => setSurgeryForm(prev => ({ ...prev, diagnosis: e.target.value }))} />
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Date" type="date" value={surgeryForm.scheduledDate} onChange={(e) => setSurgeryForm(prev => ({ ...prev, scheduledDate: e.target.value }))} />
                                <Input label="Time" type="time" value={surgeryForm.scheduledTime} onChange={(e) => setSurgeryForm(prev => ({ ...prev, scheduledTime: e.target.value }))} />
                            </div>
                            <Input label="Expected duration" placeholder="e.g. 90 min" value={surgeryForm.duration} onChange={(e) => setSurgeryForm(prev => ({ ...prev, duration: e.target.value }))} />
                            <Select label="OT Room" value={surgeryForm.otRoom} onChange={(e) => setSurgeryForm(prev => ({ ...prev, otRoom: e.target.value }))} options={[{ value: 'OT-1', label: 'OT-1' }, { value: 'OT-2', label: 'OT-2' }, { value: 'OT-3', label: 'OT-3' }, { value: 'OT-4', label: 'OT-4' }]} />
                            <Select label="Priority" value={surgeryForm.priority} onChange={(e) => setSurgeryForm(prev => ({ ...prev, priority: e.target.value }))} options={[{ value: 'elective', label: 'Elective' }, { value: 'urgent', label: 'Urgent' }, { value: 'emergency', label: 'Emergency' }]} />
                            <Input label="Anesthesia" value={surgeryForm.anesthesia} onChange={(e) => setSurgeryForm(prev => ({ ...prev, anesthesia: e.target.value }))} />
                            {surgeryMessage && <p className="text-sm text-red-700" role="alert">{surgeryMessage}</p>}
                        </div>
                    </Modal>
                    <Modal isOpen={!!selectedSurgery} onClose={() => setSelectedSurgery(null)} title="Surgical review and operative record" size="lg" footer={<div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setSelectedSurgery(null)}>Cancel</Button><Button variant="primary" onClick={saveSurgeryReview}>Save surgical record</Button></div>}>
                        <div className="space-y-4"><p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{selectedSurgery?.procedure} · {selectedSurgery?.priority} · {selectedSurgery?.diagnosis}</p><Select label="Workflow status" value={surgeryUpdate.status} onChange={(event) => setSurgeryUpdate((value) => ({...value,status:event.target.value}))} options={['requested','accepted','deferred','rejected','scheduled','in-progress','completed'].map((value) => ({value,label:value.replace('_',' ')}))} /><Input label="Review reason (required for defer/reject)" value={surgeryUpdate.reviewReason} onChange={(event) => setSurgeryUpdate((value) => ({...value,reviewReason:event.target.value}))} />{surgeryUpdate.status==='scheduled' && <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><Input label="Surgery date" type="date" value={surgeryUpdate.scheduledDate} onChange={(event)=>setSurgeryUpdate((value)=>({...value,scheduledDate:event.target.value}))}/><Input label="Surgery time" type="time" value={surgeryUpdate.scheduledTime} onChange={(event)=>setSurgeryUpdate((value)=>({...value,scheduledTime:event.target.value}))}/><Select label="Theatre room" value={surgeryUpdate.otRoom} onChange={(event)=>setSurgeryUpdate((value)=>({...value,otRoom:event.target.value}))} options={[{value:'',label:'Select room'},...Array.from({length:6},(_,index)=>({value:`OT-${index+1}`,label:`OT-${index+1}`}))]}/></div>}<Select label="Consent" value={surgeryUpdate.consentStatus} onChange={(event) => setSurgeryUpdate((value) => ({...value,consentStatus:event.target.value}))} options={['pending','documented','declined','not_applicable'].map((value) => ({value,label:value.replace('_',' ')}))} /><TextArea label="Preoperative checks and anesthesia assessment" value={surgeryUpdate.preoperativeNotes} onChange={(event) => setSurgeryUpdate((value) => ({...value,preoperativeNotes:event.target.value}))} rows={3} /><TextArea label="Operative notes and responsible team" value={surgeryUpdate.operativeNotes} onChange={(event) => setSurgeryUpdate((value) => ({...value,operativeNotes:event.target.value}))} rows={4} /><TextArea label="Complications" value={surgeryUpdate.complications} onChange={(event) => setSurgeryUpdate((value) => ({...value,complications:event.target.value}))} rows={2} /><TextArea label="Postoperative plan" value={surgeryUpdate.postoperativePlan} onChange={(event) => setSurgeryUpdate((value) => ({...value,postoperativePlan:event.target.value}))} rows={3} />{surgeryMessage && <p className="text-sm text-red-700" role="alert">{surgeryMessage}</p>}</div>
                    </Modal>
                </div>
            );
        };
