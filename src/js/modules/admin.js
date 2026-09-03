        // ==========================================
        // REPORTS MODULE
        // ==========================================
        const ReportsModule = () => {
            const [reportType, setReportType] = useState('patients');

            const reportTypes = [
                { id: 'patients', label: 'Patient Statistics', icon: Icons.Users },
                { id: 'revenue', label: 'Revenue Report', icon: Icons.DollarSign },
                { id: 'pharmacy', label: 'Pharmacy Report', icon: Icons.Pill },
                { id: 'lab', label: 'Laboratory Report', icon: Icons.FlaskConical },
                { id: 'admissions', label: 'Admissions Report', icon: Icons.Bed },
            ];

            const handleExport = () => {
                const typeData = {
                    patients: seedData.patients,
                    revenue: seedData.billing,
                    pharmacy: seedData.pharmacyInventory,
                    lab: seedData.labOrders,
                    admissions: seedData.admissions
                }[reportType] || [];

                if (!typeData.length) return;
                const keys = Object.keys(typeData[0]);
                const csv = [keys.join(',')].concat(typeData.map(row => keys.map(key => JSON.stringify(row[key] ?? '')).join(','))).join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `${reportType}-report.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Reports</h2>
                            <p className="text-slate-500 mt-1">Generate and view hospital reports</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" icon={Icons.Calendar}>Date Range</Button>
                            <Button variant="primary" icon={Icons.Download} onClick={handleExport}>Export</Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {reportTypes.map(type => (
                            <button
                                key={type.id}
                                onClick={() => setReportType(type.id)}
                                className={'p-4 rounded-xl border text-left transition-all ' + (reportType === type.id ? 'border-medical-300 bg-medical-50 ring-1 ring-medical-200' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}
                            >
                                <type.icon size={24} className={reportType === type.id ? 'text-medical-600' : 'text-slate-400'} />
                                <p className={'text-sm font-medium mt-2 ' + (reportType === type.id ? 'text-medical-900' : 'text-slate-700')}>{type.label}</p>
                            </button>
                        ))}
                    </div>

                    <Card title={reportTypes.find(r => r.id === reportType)?.label}>
                        {reportType === 'patients' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 bg-slate-50 rounded-xl">
                                        <p className="text-xs text-slate-500 uppercase">Total Patients</p>
                                        <p className="text-2xl font-bold text-slate-900">{seedData.patients.length}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-xl">
                                        <p className="text-xs text-slate-500 uppercase">New This Month</p>
                                        <p className="text-2xl font-bold text-slate-900">24</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-xl">
                                        <p className="text-xs text-slate-500 uppercase">Average Age</p>
                                        <p className="text-2xl font-bold text-slate-900">42 years</p>
                                    </div>
                                </div>
                                <BarChart 
                                    data={[
                                        { label: '0-18', value: 8 },
                                        { label: '19-35', value: 15 },
                                        { label: '36-50', value: 12 },
                                        { label: '51-65', value: 10 },
                                        { label: '65+', value: 5 }
                                    ]} 
                                    width={600} 
                                    height={250} 
                                    color="#2563eb" 
                                />
                            </div>
                        )}

                        {reportType === 'revenue' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 bg-emerald-50 rounded-xl">
                                        <p className="text-xs text-emerald-600 uppercase">Total Revenue</p>
                                        <p className="text-2xl font-bold text-emerald-900">{formatCurrency(125000)}</p>
                                    </div>
                                    <div className="p-4 bg-amber-50 rounded-xl">
                                        <p className="text-xs text-amber-600 uppercase">Outstanding</p>
                                        <p className="text-2xl font-bold text-amber-900">{formatCurrency(28000)}</p>
                                    </div>
                                    <div className="p-4 bg-medical-50 rounded-xl">
                                        <p className="text-xs text-medical-600 uppercase">Insurance Claims</p>
                                        <p className="text-2xl font-bold text-medical-900">{formatCurrency(45000)}</p>
                                    </div>
                                </div>
                                <LineChart 
                                    data={[
                                        { value: 85000, label: 'Jan' },
                                        { value: 92000, label: 'Feb' },
                                        { value: 88000, label: 'Mar' },
                                        { value: 95000, label: 'Apr' },
                                        { value: 102000, label: 'May' },
                                        { value: 98000, label: 'Jun' },
                                        { value: 110000, label: 'Jul' },
                                        { value: 125000, label: 'Aug' }
                                    ]} 
                                    width={700} 
                                    height={250} 
                                    color="#059669" 
                                />
                            </div>
                        )}

                        {reportType === 'pharmacy' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 bg-slate-50 rounded-xl">
                                        <p className="text-xs text-slate-500 uppercase">Items in Stock</p>
                                        <p className="text-2xl font-bold text-slate-900">{seedData.pharmacyInventory.length}</p>
                                    </div>
                                    <div className="p-4 bg-red-50 rounded-xl">
                                        <p className="text-xs text-red-600 uppercase">Low Stock Items</p>
                                        <p className="text-2xl font-bold text-red-900">{seedData.pharmacyInventory.filter(d => d.status === 'low_stock').length}</p>
                                    </div>
                                    <div className="p-4 bg-amber-50 rounded-xl">
                                        <p className="text-xs text-amber-600 uppercase">Expiring Soon</p>
                                        <p className="text-2xl font-bold text-amber-900">12</p>
                                    </div>
                                </div>
                                <DataTable
                                    columns={[
                                        { key: 'category', title: 'Category' },
                                        { key: 'count', title: 'Items', render: () => Math.floor(Math.random() * 20 + 5) },
                                        { key: 'value', title: 'Stock Value', render: () => formatCurrency(Math.random() * 5000 + 1000) }
                                    ]}
                                    data={['Antibiotic', 'Analgesic', 'Antidiabetic', 'Antihypertensive', 'Statin', 'PPI'].map(c => ({ category: c }))}
                                />
                            </div>
                        )}

                        {reportType === 'lab' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 bg-slate-50 rounded-xl">
                                        <p className="text-xs text-slate-500 uppercase">Tests This Month</p>
                                        <p className="text-2xl font-bold text-slate-900">{seedData.labOrders.length}</p>
                                    </div>
                                    <div className="p-4 bg-medical-50 rounded-xl">
                                        <p className="text-xs text-medical-600 uppercase">Turnaround Time</p>
                                        <p className="text-2xl font-bold text-medical-900">3.2 hours</p>
                                    </div>
                                    <div className="p-4 bg-red-50 rounded-xl">
                                        <p className="text-xs text-red-600 uppercase">Critical Results</p>
                                        <p className="text-2xl font-bold text-red-900">{seedData.labOrders.filter(l => l.status === 'critical').length}</p>
                                    </div>
                                </div>
                                <BarChart 
                                    data={[
                                        { label: 'CBC', value: 45 },
                                        { label: 'Lipid', value: 32 },
                                        { label: 'LFT', value: 28 },
                                        { label: 'KFT', value: 24 },
                                        { label: 'Glucose', value: 38 },
                                        { label: 'Thyroid', value: 18 }
                                    ]} 
                                    width={600} 
                                    height={250} 
                                    color="#7c3aed" 
                                />
                            </div>
                        )}

                        {reportType === 'admissions' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 bg-slate-50 rounded-xl">
                                        <p className="text-xs text-slate-500 uppercase">Current Admissions</p>
                                        <p className="text-2xl font-bold text-slate-900">{seedData.admissions.filter(a => a.status === 'active').length}</p>
                                    </div>
                                    <div className="p-4 bg-emerald-50 rounded-xl">
                                        <p className="text-xs text-emerald-600 uppercase">Discharged This Week</p>
                                        <p className="text-2xl font-bold text-emerald-900">18</p>
                                    </div>
                                    <div className="p-4 bg-red-50 rounded-xl">
                                        <p className="text-xs text-red-600 uppercase">Average LOS</p>
                                        <p className="text-2xl font-bold text-red-900">4.2 days</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                    {seedData.wards.map(ward => (
                                        <div key={ward.id} className="p-4 rounded-xl bg-slate-50 text-center">
                                            <p className="text-sm font-medium text-slate-700">{ward.name}</p>
                                            <p className="text-xl font-bold text-slate-900 mt-1">{ward.occupied}/{ward.capacity}</p>
                                            <ProgressBar value={ward.occupied} max={ward.capacity} color="medical" size="sm" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            );
        };

