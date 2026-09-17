        const UnauthorizedModule = () => {
            const { user } = useAuth();
            return (
                <div className="p-6 animate-fade-in">
                    <div className="max-w-xl mx-auto">
                        <Card title="Access restricted">
                            <div className="space-y-4">
                                <div className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">Permission denied</div>
                                <p className="text-slate-700">
                                    This module is not available for the current role: <span className="font-semibold text-slate-900">{user?.role || 'Unknown role'}</span>.
                                </p>
                                <p className="text-sm text-slate-500">
                                    Please contact your super administrator to request access or update the role matrix permissions.
                                </p>
                                <Button variant="primary" onClick={() => window.dispatchEvent(new CustomEvent('onemed:navigate', { detail: 'dashboard' }))}>Return to dashboard</Button>
                            </div>
                        </Card>
                    </div>
                </div>
            );
        };

        const App = () => {
            const [isAuthenticated, setIsAuthenticated] = useState(false);
            const [activeModule, setActiveModule] = useState('dashboard');
            const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
            const [notifications, setNotifications] = useState(appData.notifications || []);
            const [toasts, setToasts] = useState([]);
            const [dataVersion, setDataVersion] = useState(0);
            const [dataLoad, setDataLoad] = useState({ loading: false, failures: [] });
            const [theme, setTheme] = useState(() => {
                try {
                    return localStorage.getItem('onemed_theme') || 'dark';
                } catch (e) {
                    return 'dark';
                }
            });

            const { user, logout, hasModuleAccess } = useAuth();
            const supabaseStatus = window.OneMedSupabase?.getStatus?.() || { configured: false, mode: 'local' };

            useEffect(() => {
                try {
                    document.body.classList.remove('theme-light', 'theme-dark');
                    document.body.classList.add(`theme-${theme}`);
                    localStorage.setItem('onemed_theme', theme);
                } catch (e) {}
            }, [theme]);

            const handleLogout = () => {
                logout();
                setIsAuthenticated(false);
                setActiveModule('dashboard');
            };

            useEffect(() => {
                const handleNavigation = (event) => {
                    if (event.detail) setActiveModule(event.detail);
                };
                window.addEventListener('onemed:navigate', handleNavigation);
                return () => window.removeEventListener('onemed:navigate', handleNavigation);
            }, []);

            useEffect(() => {
                const handlePersistenceError = (event) => addToast(event.detail || 'No changes were saved.', 'error');
                window.addEventListener('onemed:persistence-error', handlePersistenceError);
                return () => window.removeEventListener('onemed:persistence-error', handlePersistenceError);
            }, []);

            useEffect(() => {
                setIsAuthenticated(Boolean(user));
            }, [user]);

            useEffect(() => {
                if (!isAuthenticated) return undefined;

                let cancelled = false;
                const loadInitialData = async () => {
                    setDataLoad({ loading: true, failures: [] });
                    try {
                        const result = await loadSupabaseTables();
                        if (!cancelled && result) {
                            setNotifications((appData.notifications || []).slice(0));
                            setDataLoad({ loading: false, failures: result.failures || [] });
                            setDataVersion((value) => value + 1);
                        }
                    } catch (error) {
                        if (!cancelled) {
                            setDataLoad({
                                loading: false,
                                failures: [{ table: 'connection', message: error?.message || 'The authorized records could not be loaded.' }]
                            });
                        }
                    }
                };

                // Load once after a successful sign-in. Do not poll or reload the
                // screen in the background: subsequent remote data loads happen
                // only when the user performs a normal browser refresh.
                loadInitialData();
                return () => {
                    cancelled = true;
                };
            }, [isAuthenticated]);

            const handleLogin = () => setIsAuthenticated(true);

            const addToast = (message, type = 'info') => {
                const id = Date.now();
                setToasts(prev => [...prev, { id, message, type }]);
                setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
            };

            const persistNotificationReadState = async (notificationIds, read = true) => {
                const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds];
                const client = window.OneMedSupabase?.getClient?.();
                if (!ids.length) return null;
                if (!client) return notifyPersistenceFailure('update notification status');
                const { error } = await client.from('notifications').update({ read }).in('id', ids);
                if (error) return notifyPersistenceFailure('update notification status', error);
                const idSet = new Set(ids);
                const next = (appData.notifications || []).map((notification) =>
                    idSet.has(notification.id) ? { ...notification, read } : notification
                );
                appData.notifications = next;
                setNotifications(next.slice());
                return next;
            };

            const normalizeModuleId = (moduleId) => {
                const aliasMap = {
                    appointment: 'appointments',
                    appointments: 'appointments',
                    doctor: 'doctors',
                    doctors: 'doctors',
                    lab: 'laboratory',
                    labs: 'laboratory',
                    laboratory: 'laboratory',
                    results: 'laboratory',
                    imaging: 'radiology',
                    radiology: 'radiology',
                    cds: 'clinical_decision_support',
                    clinical_decision: 'clinical_decision_support',
                    decision_support: 'clinical_decision_support',
                    ops: 'operations',
                    operations: 'operations',
                    command_center: 'operations',
                    procurement_and_supply: 'procurement',
                    supply_chain: 'procurement',
                    referral: 'referrals',
                    referrals: 'referrals',
                    care_coordination: 'referrals',
                    staffing: 'workforce',
                    workforce_analytics: 'workforce',
                    medications: 'pharmacy',
                    pharmacy: 'pharmacy',
                    finance: 'billing',
                    insurance_claims: 'insurance',
                    claims: 'insurance',
                    payment: 'payments',
                    document_control: 'documents',
                    clinical_documents: 'documents',
                    governance: 'compliance',
                    policy_library: 'compliance',
                    admission: 'admissions',
                    ward: 'admissions',
                    surgery: 'surgeries',
                    safety: 'clinical_safety',
                    stock: 'inventory',
                    staff: 'hr',
                    human_resources: 'hr',
                    medical_offices: 'offices',
                    office: 'offices',
                    report: 'reports',
                    audit_logs: 'audit',
                    system_settings: 'settings',
                    portal: 'portal'
                };

                const safeId = String(moduleId || '').trim();
                return aliasMap[safeId] || safeId;
            };

            const moduleMap = {
                dashboard: () => <DashboardModule />,
                patients: () => <PatientsModule />,
                appointments: () => user?.role === 'patient' ? <PatientPortalModule initialTab="appointments" /> : <AppointmentsModule />,
                doctors: () => <DoctorsModule />,
                consultations: () => <ConsultationsModule />,
                laboratory: () => <LaboratoryModule />,
                radiology: () => <RadiologyModule />,
                clinical_workflows: () => <ClinicalWorkflowsModule />,
                clinical_decision_support: () => <ClinicalDecisionSupportModule />,
                operations: () => <OperationsModule />,
                procurement: () => <ProcurementModule />,
                referrals: () => <CareCoordinationModule />,
                workforce: () => <WorkforceModule />,
                pharmacy: () => <PharmacyModule />,
                inventory: () => <InventoryModule />,
                billing: () => user?.role === 'patient' ? <PatientPortalModule initialTab="billing" /> : <BillingModule initialTab="invoices" />,
                insurance: () => <BillingModule initialTab="insurance" />,
                payments: () => <BillingModule initialTab="payments" />,
                documents: () => <DocumentsModule />,
                compliance: () => <ComplianceVaultModule />,
                admissions: () => <AdmissionsModule />,
                surgeries: () => <SurgeriesModule />,
                clinical_safety: () => <ClinicalSafetyModule />,
                reports: () => <ReportsModule />,
                audit: () => <AuditModule />,
                settings: () => <SettingsModule />,
                offices: () => <MedicalOfficesModule />,
                hr: () => <HRStaffModule />,
                portal: () => <PatientPortalModule />,
                ward: () => <AdmissionsModule />,
                vitals: () => <VitalsModule />,
                upload: () => <DocumentsModule />,
                medications: () => <PharmacyModule initialTab="prescriptions" />,
                results: () => <LaboratoryModule initialTab="results" />,
                messages: () => <PatientPortalModule initialTab="messages" />,
                prescriptions: () => user?.role === 'patient' ? <PatientPortalModule initialTab="prescriptions" /> : <PharmacyModule initialTab="prescriptions" />,
                lab_results: () => <PatientPortalModule initialTab="lab_results" />
            };

            const renderModule = () => {
                const resolvedModule = normalizeModuleId(activeModule);
                if (user && !hasModuleAccess(resolvedModule)) {
                    return <UnauthorizedModule />;
                }
                const moduleView = moduleMap[resolvedModule] ? moduleMap[resolvedModule]() : <DashboardModule />;
                // Data is loaded after authentication. Recreate the active screen
                // when that live snapshot changes so stateful modules do not retain
                // the empty arrays from their first render.
                return React.cloneElement(moduleView, { key: `${resolvedModule}:${dataVersion}` });
            };

            if (!isAuthenticated) {
                return (
                    <div className={`theme-shell theme-${theme}`}>
                        <LoginPage onLogin={handleLogin} />
                    </div>
                );
            }

            return (
                <div className={`theme-shell theme-${theme}`}>
                    <div className="app-shell flex h-screen">
                        <Sidebar 
                            activeModule={activeModule} 
                            onModuleChange={setActiveModule}
                            collapsed={sidebarCollapsed}
                            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                            onLogout={handleLogout}
                            theme={theme}
                        />
                        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                            <Header 
                                notifications={notifications}
                                onNavigate={setActiveModule}
                                onNotificationClick={(notif) => persistNotificationReadState(notif.id)}
                                onMarkAllNotificationsRead={() => persistNotificationReadState(notifications.filter((n) => !n.read).map((n) => n.id))}
                                onLogout={handleLogout}
                                theme={theme}
                                onToggleTheme={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
                            />
                            <main className="flex-1 overflow-y-auto app-main">
                                {dataLoad.loading && (
                                    <div className="mx-6 mt-4 rounded-xl border border-medical-200 bg-medical-50 px-4 py-3 text-sm text-medical-800" role="status">
                                        Loading your authorized records…
                                    </div>
                                )}
                                {dataLoad.failures.length > 0 && (
                                    <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
                                        Some records could not be loaded ({dataLoad.failures.map((failure) => failure.table).join(', ')}). Reload the browser to try again.
                                    </div>
                                )}
                                {renderModule()}
                            </main>
                        </div>
                        <div className="fixed bottom-4 right-4 space-y-2 z-50">
                            {toasts.map(toast => (
                                <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} />
                            ))}
                        </div>
                    </div>
                </div>
            );
        };

        // ==========================================
        // RENDER
        // ==========================================
        const rootElement = document.getElementById('root');
        if (rootElement) {
            const root = ReactDOM.createRoot(rootElement);
            root.render(
                <AuthProvider>
                    <App />
                </AuthProvider>
            );
        }
