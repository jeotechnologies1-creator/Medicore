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

            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const startOfWeek = new Date(now);
            startOfWeek.setHours(0, 0, 0, 0);
            startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
            const toDate = (value) => value ? new Date(value) : null;
            const isOnOrAfter = (value, threshold) => {
                const date = toDate(value);
                return date && !Number.isNaN(date.valueOf()) && date >= threshold;
            };
            const patientAges = seedData.patients.map(patient => calculateAge(patient.dateOfBirth)).filter(age => Number.isFinite(age) && age >= 0);
            const patientAgeGroups = [
                { label: '0-18', min: 0, max: 18 }, { label: '19-35', min: 19, max: 35 }, { label: '36-50', min: 36, max: 50 },
                { label: '51-65', min: 51, max: 65 }, { label: '65+', min: 66, max: Infinity }
            ].map(group => ({ ...group, value: patientAges.filter(age => age >= group.min && age <= group.max).length }));
            const totalRevenue = seedData.billing.reduce((sum, invoice) => sum + Number(invoice.paid || 0), 0);
            const outstandingRevenue = seedData.billing.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0);
            const insuranceClaimTotal = seedData.insuranceClaims.reduce((sum, claim) => sum + Number(claim.amountApproved || claim.amountClaimed || 0), 0);
            const revenueTrend = Array.from({ length: 6 }, (_, index) => {
                const month = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
                return {
                    label: month.toLocaleDateString(undefined, { month: 'short' }),
                    value: seedData.billing.filter(invoice => {
                        const date = toDate(invoice.date);
                        return date && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
                    }).reduce((sum, invoice) => sum + Number(invoice.paid || 0), 0)
                };
            });
            const expiringSoon = seedData.pharmacyInventory.filter(item => {
                const expiry = toDate(item.expiryDate);
                const limit = new Date(now);
                limit.setDate(limit.getDate() + 90);
                return expiry && expiry >= now && expiry <= limit;
            }).length;
            const monthlyLabOrders = seedData.labOrders.filter(order => isOnOrAfter(order.orderedDate, startOfMonth));
            const labTurnaroundHours = seedData.labOrders.map(order => {
                const ordered = toDate(order.orderedDate);
                const completed = toDate(order.resultDate);
                return ordered && completed && completed >= ordered ? (completed - ordered) / 3600000 : null;
            }).filter(hours => hours !== null);
            const labTypeData = Object.entries(seedData.labOrders.reduce((counts, order) => {
                const type = order.testType || 'Unspecified';
                counts[type] = (counts[type] || 0) + 1;
                return counts;
            }, {})).map(([label, value]) => ({ label, value })).slice(0, 6);
            const dischargedThisWeek = seedData.admissions.filter(admission => admission.status === 'discharged' && isOnOrAfter(admission.dischargeDate, startOfWeek)).length;
            const stayLengths = seedData.admissions.map(admission => {
                const start = toDate(admission.admissionDate);
                const end = toDate(admission.dischargeDate);
                return start && end && end >= start ? (end - start) / 86400000 : null;
            }).filter(days => days !== null);

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
                                        <p className="text-2xl font-bold text-slate-900">{seedData.patients.filter(patient => isOnOrAfter(patient.registrationDate, startOfMonth)).length}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-xl">
                                        <p className="text-xs text-slate-500 uppercase">Average Age</p>
                                        <p className="text-2xl font-bold text-slate-900">{patientAges.length ? `${Math.round(patientAges.reduce((sum, age) => sum + age, 0) / patientAges.length)} years` : 'N/A'}</p>
                                    </div>
                                </div>
                                <BarChart 
                                    data={patientAgeGroups}
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
                                        <p className="text-2xl font-bold text-emerald-900">{formatCurrency(totalRevenue)}</p>
                                    </div>
                                    <div className="p-4 bg-amber-50 rounded-xl">
                                        <p className="text-xs text-amber-600 uppercase">Outstanding</p>
                                        <p className="text-2xl font-bold text-amber-900">{formatCurrency(outstandingRevenue)}</p>
                                    </div>
                                    <div className="p-4 bg-medical-50 rounded-xl">
                                        <p className="text-xs text-medical-600 uppercase">Insurance Claims</p>
                                        <p className="text-2xl font-bold text-medical-900">{formatCurrency(insuranceClaimTotal)}</p>
                                    </div>
                                </div>
                                <LineChart 
                                    data={revenueTrend}
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
                                        <p className="text-2xl font-bold text-amber-900">{expiringSoon}</p>
                                    </div>
                                </div>
                                <DataTable
                                    columns={[
                                        { key: 'category', title: 'Category' },
                                        { key: 'count', title: 'Items', render: (row) => seedData.pharmacyInventory.filter(item => item.category === row.category).length },
                                        { key: 'value', title: 'Stock Value', render: (row) => formatCurrency(seedData.pharmacyInventory.filter(item => item.category === row.category).reduce((sum, item) => sum + Number(item.stockQuantity || 0) * Number(item.unitPrice || 0), 0)) }
                                    ]}
                                    data={Array.from(new Set(seedData.pharmacyInventory.map(item => item.category).filter(Boolean))).map(category => ({ category }))}
                                />
                            </div>
                        )}

                        {reportType === 'lab' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 bg-slate-50 rounded-xl">
                                        <p className="text-xs text-slate-500 uppercase">Tests This Month</p>
                                        <p className="text-2xl font-bold text-slate-900">{monthlyLabOrders.length}</p>
                                    </div>
                                    <div className="p-4 bg-medical-50 rounded-xl">
                                        <p className="text-xs text-medical-600 uppercase">Turnaround Time</p>
                                        <p className="text-2xl font-bold text-medical-900">{labTurnaroundHours.length ? `${(labTurnaroundHours.reduce((sum, hours) => sum + hours, 0) / labTurnaroundHours.length).toFixed(1)} hours` : 'N/A'}</p>
                                    </div>
                                    <div className="p-4 bg-red-50 rounded-xl">
                                        <p className="text-xs text-red-600 uppercase">Critical Results</p>
                                        <p className="text-2xl font-bold text-red-900">{seedData.labOrders.filter(l => l.status === 'critical').length}</p>
                                    </div>
                                </div>
                                <BarChart 
                                    data={labTypeData}
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
                                        <p className="text-2xl font-bold text-emerald-900">{dischargedThisWeek}</p>
                                    </div>
                                    <div className="p-4 bg-red-50 rounded-xl">
                                        <p className="text-xs text-red-600 uppercase">Average LOS</p>
                                        <p className="text-2xl font-bold text-red-900">{stayLengths.length ? `${(stayLengths.reduce((sum, days) => sum + days, 0) / stayLengths.length).toFixed(1)} days` : 'N/A'}</p>
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
