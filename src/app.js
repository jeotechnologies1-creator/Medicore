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
                                <Button variant="primary" onClick={() => window.dispatchEvent(new CustomEvent('medicore:navigate', { detail: 'dashboard' }))}>Return to dashboard</Button>
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
            const [notifications, setNotifications] = useState(seedData.notifications || []);
            const [toasts, setToasts] = useState([]);
            const [dataVersion, setDataVersion] = useState(0);
            const [theme, setTheme] = useState(() => {
                try {
                    return localStorage.getItem('medicore_theme') || 'dark';
                } catch (e) {
                    return 'dark';
                }
            });

            const { user, logout, hasModuleAccess } = useAuth();
            const supabaseStatus = window.MedicoreSupabase?.getStatus?.() || { configured: false, mode: 'local' };

            useEffect(() => {
                try {
                    document.body.classList.remove('theme-light', 'theme-dark');
                    document.body.classList.add(`theme-${theme}`);
                    localStorage.setItem('medicore_theme', theme);
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
                window.addEventListener('medicore:navigate', handleNavigation);
                return () => window.removeEventListener('medicore:navigate', handleNavigation);
            }, []);

            useEffect(() => {
                const handlePersistenceError = (event) => addToast(event.detail || 'No changes were saved.', 'error');
                window.addEventListener('medicore:persistence-error', handlePersistenceError);
                return () => window.removeEventListener('medicore:persistence-error', handlePersistenceError);
            }, []);

            useEffect(() => {
                setIsAuthenticated(Boolean(user));
            }, [user]);

            useEffect(() => {
                if (!isAuthenticated) return undefined;

                let cancelled = false;
                const syncLiveData = async () => {
                    const synced = await loadSupabaseTables();
                    if (!cancelled && synced) {
                        setNotifications((seedData.notifications || []).slice(0));
                        setDataVersion((value) => value + 1);
                    }
                };

                syncLiveData();
                const refreshTimer = window.setInterval(syncLiveData, 30000);
                return () => {
                    cancelled = true;
                    window.clearInterval(refreshTimer);
                };
            }, [isAuthenticated]);

            const handleLogin = () => setIsAuthenticated(true);

            const addToast = (message, type = 'info') => {
                const id = Date.now();
                setToasts(prev => [...prev, { id, message, type }]);
                setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
            };

            const renderModule = () => {
                if (user && !hasModuleAccess(activeModule)) {
                    return <UnauthorizedModule />;
                }

                switch (activeModule) {
                    case 'dashboard': return <DashboardModule />;
                    case 'patients': return <PatientsModule />;
                    case 'appointments': return <AppointmentsModule />;
                    case 'doctors': return <DoctorsModule />;
                    case 'consultations': return <ConsultationsModule />;
                    case 'laboratory': return <LaboratoryModule />;
                    case 'results': return <LaboratoryModule />;
                    case 'radiology': return <RadiologyModule />;
                    case 'clinical_decision_support': return <ClinicalDecisionSupportModule />;
                    case 'operations': return <OperationsModule />;
                    case 'procurement': return <ProcurementModule />;
                    case 'referrals': return <CareCoordinationModule />;
                    case 'workforce': return <WorkforceModule />;
                    case 'upload': return <DocumentsModule />;
                    case 'pharmacy': return <PharmacyModule />;
                    case 'inventory': return <InventoryModule />;
                    case 'billing': return <BillingModule initialTab="invoices" />;
                    case 'insurance': return <BillingModule initialTab="insurance" />;
                    case 'payments': return <BillingModule initialTab="payments" />;
                    case 'documents': return <DocumentsModule />;
                    case 'compliance': return <ComplianceVaultModule />;
                    case 'admissions': return <AdmissionsModule />;
                    case 'ward': return <AdmissionsModule />;
                    case 'vitals': return <VitalsModule />;
                    case 'clinical_safety': return <ClinicalSafetyModule />;
                    case 'surgeries': return <SurgeriesModule />;
                    case 'reports': return <ReportsModule />;
                    case 'audit': return <AuditModule />;
                    case 'settings': return <SettingsModule />;
                    case 'offices': return <MedicalOfficesModule />;
                    case 'hr': return <HRStaffModule />;
                    case 'portal': return <PatientPortalModule />;
                    case 'lab_results': return <PatientPortalModule />;
                    case 'prescriptions': return <PatientPortalModule />;
                    case 'messages': return <PatientPortalModule />;
                    case 'medications': return <PharmacyModule />;
                    case 'documents': return <DocumentsModule />;
                    default: return <DashboardModule />;
                }
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
                                onNotificationClick={(notif) => {
                                    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
                                }}
                                onMarkAllNotificationsRead={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                                onLogout={handleLogout}
                                theme={theme}
                                onToggleTheme={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
                            />
                            <main className="flex-1 overflow-y-auto app-main">
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
