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
                try {
                    const saved = localStorage.getItem('medicore_user');
                    if (saved) setIsAuthenticated(true);
                } catch (e) {}
            }, []);

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
                    return <DashboardModule />;
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
                    case 'operations': return <OperationsModule />;
                    case 'procurement': return <ProcurementModule />;
                    case 'referrals': return <CareCoordinationModule />;
                    case 'upload': return <DocumentsModule />;
                    case 'pharmacy': return <PharmacyModule />;
                    case 'inventory': return <InventoryModule />;
                    case 'billing': return <BillingModule />;
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
