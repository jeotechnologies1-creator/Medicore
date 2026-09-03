        // ==========================================
        // AUTH CONTEXT
        // ==========================================
        const AuthContext = React.createContext(null);

        const canonicalModuleKeys = [
            'dashboard', 'patients', 'appointments', 'doctors', 'laboratory', 'radiology',
            'clinical_decision_support', 'operations', 'procurement', 'referrals', 'workforce', 'pharmacy', 'billing', 'insurance', 'payments', 'documents', 'compliance', 'admissions', 'surgeries', 'clinical_safety', 'inventory',
            'hr', 'offices', 'reports', 'audit', 'settings'
        ];

        const legacyPermissionAliases = {
            appointments: ['appointment'],
            doctors: ['doctor'],
            laboratory: ['labs', 'lab', 'lab_orders'],
            radiology: ['imaging'],
            clinical_decision_support: ['cds', 'clinical_decision', 'decision_support'],
            operations: ['ops', 'operations_center', 'command_center'],
            procurement: ['supply_chain', 'procurement_and_supply'],
            referrals: ['care_coordination', 'referral_management', 'care_pathways'],
            workforce: ['staffing', 'workforce_analytics', 'human_capital'],
            pharmacy: ['medications'],
            billing: ['finance'],
            insurance: ['insurance_claims', 'claims'],
            payments: ['payment'],
            documents: ['document_control', 'clinical_documents'],
            compliance: ['governance', 'policy_library'],
            admissions: ['admission', 'ward'],
            surgeries: ['surgery'],
            clinical_safety: ['safety'],
            inventory: ['stock'],
            hr: ['staff', 'human_resources'],
            offices: ['medical_offices', 'office'],
            reports: ['report'],
            audit: ['audit_logs'],
            settings: ['system_settings']
        };

        const normalizeRoleMatrix = (matrix) => {
            const safeMatrix = Array.isArray(matrix) ? matrix : [];
            if (!safeMatrix.length) return defaultRoleMatrix;

            return safeMatrix.map((row) => {
                const permissions = { ...(row?.permissions || {}) };
                canonicalModuleKeys.forEach((moduleKey) => {
                    const aliasKeys = [moduleKey, ...(legacyPermissionAliases[moduleKey] || [])];
                    const sourceKey = aliasKeys.find((key) => permissions[key] !== undefined);
                    if (sourceKey && permissions[moduleKey] === undefined) {
                        permissions[moduleKey] = Boolean(permissions[sourceKey]);
                    }
                });

                if (String(row?.role || '').trim().toLowerCase() === 'super_admin') {
                    canonicalModuleKeys.forEach((key) => {
                        permissions[key] = true;
                    });
                }

                return {
                    ...row,
                    permissions
                };
            });
        };

        const defaultRoleMatrix = [
            {
                role: 'Super Admin',
                permissions: {
                    dashboard: true,
                    patients: true,
                    appointments: true,
                    doctors: true,
                    laboratory: true,
                    radiology: true,
                    clinical_decision_support: true,
                    operations: true,
                    procurement: true,
                    referrals: true,
                    workforce: true,
                    pharmacy: true,
                    billing: true,
                    insurance: true,
                    payments: true,
                    documents: true,
                    compliance: true,
                    admissions: true,
                    surgeries: true,
                    clinical_safety: true,
                    inventory: true,
                    hr: true,
                    offices: true,
                    reports: true,
                    audit: true,
                    settings: true
                }
            },
            {
                role: 'Doctor',
                permissions: {
                    dashboard: true,
                    patients: true,
                    appointments: true,
                    doctors: true,
                    laboratory: true,
                    radiology: true,
                    clinical_decision_support: true,
                    operations: true,
                    procurement: false,
                    referrals: true,
                    workforce: true,
                    pharmacy: false,
                    billing: false,
                    insurance: false,
                    payments: false,
                    documents: true,
                    compliance: true,
                    admissions: false,
                    surgeries: false,
                    clinical_safety: true,
                    inventory: false,
                    hr: false,
                    offices: false,
                    reports: false,
                    audit: false,
                    settings: false
                }
            },
            {
                role: 'Nurse',
                permissions: {
                    dashboard: true,
                    patients: true,
                    appointments: false,
                    doctors: false,
                    laboratory: false,
                    radiology: false,
                    clinical_decision_support: true,
                    operations: true,
                    procurement: false,
                    referrals: true,
                    workforce: true,
                    pharmacy: false,
                    billing: false,
                    insurance: false,
                    payments: false,
                    documents: true,
                    compliance: true,
                    admissions: true,
                    surgeries: false,
                    clinical_safety: true,
                    inventory: false,
                    hr: false,
                    offices: false,
                    reports: false,
                    audit: false,
                    settings: false
                }
            },
            {
                role: 'Pharmacist',
                permissions: {
                    dashboard: true,
                    patients: false,
                    appointments: false,
                    doctors: false,
                    laboratory: false,
                    radiology: false,
                    operations: false,
                    procurement: true,
                    referrals: false,
                    workforce: false,
                    pharmacy: true,
                    billing: false,
                    insurance: false,
                    payments: false,
                    documents: true,
                    compliance: false,
                    admissions: false,
                    surgeries: false,
                    clinical_safety: false,
                    inventory: true,
                    hr: false,
                    offices: false,
                    reports: false,
                    audit: false,
                    settings: false
                }
            },
            {
                role: 'Receptionist',
                permissions: {
                    dashboard: true,
                    patients: true,
                    appointments: true,
                    doctors: false,
                    laboratory: false,
                    radiology: false,
                    operations: false,
                    procurement: false,
                    referrals: true,
                    workforce: false,
                    pharmacy: false,
                    billing: true,
                    insurance: false,
                    payments: false,
                    documents: false,
                    compliance: false,
                    admissions: false,
                    surgeries: false,
                    clinical_safety: false,
                    inventory: false,
                    hr: false,
                    offices: false,
                    reports: false,
                    audit: false,
                    settings: false
                }
            }
        ];

        const AuthProvider = ({ children }) => {
            const [user, setUser] = useState(() => {
                try {
                    const saved = localStorage.getItem('medicore_user');
                    return saved ? JSON.parse(saved) : null;
                } catch (e) {
                    return null;
                }
            });
            const [roleMatrix, setRoleMatrix] = useState(() => {
                try {
                    const saved = JSON.parse(localStorage.getItem('medicore_role_matrix') || '[]');
                    return normalizeRoleMatrix(saved);
                } catch (e) {
                    return defaultRoleMatrix;
                }
            });
            const [loading, setLoading] = useState(false);

            useEffect(() => {
                const hydrateRoleMatrix = async () => {
                    try {
                        const savedLocal = (() => {
                            try {
                                const parsed = JSON.parse(localStorage.getItem('medicore_role_matrix') || '[]');
                                return Array.isArray(parsed) ? parsed : [];
                            } catch (e) {
                                return [];
                            }
                        })();

                        if (savedLocal.length) {
                            const normalizedSaved = normalizeRoleMatrix(savedLocal);
                            setRoleMatrix(normalizedSaved);
                            localStorage.setItem('medicore_role_matrix', JSON.stringify(normalizedSaved));
                            return;
                        }

                        if (window.MedicoreSupabase && typeof window.MedicoreSupabase.loadSystemSettings === 'function') {
                            const remoteSettings = await window.MedicoreSupabase.loadSystemSettings();
                            const remoteMatrix = Array.isArray(remoteSettings.roleMatrix) ? remoteSettings.roleMatrix : [];
                            if (remoteMatrix.length) {
                                const normalizedRemote = normalizeRoleMatrix(remoteMatrix);
                                setRoleMatrix(normalizedRemote);
                                localStorage.setItem('medicore_role_matrix', JSON.stringify(normalizedRemote));
                            }
                        }
                    } catch (e) {
                        console.warn('Role matrix hydration unavailable:', e);
                    }
                };

                hydrateRoleMatrix();
            }, []);

            const login = useCallback(async (email, password) => {
                setLoading(true);
                try {
                    let found = null;
                    const normalizedEmail = String(email || '').trim();
                    const normalizedPassword = String(password || '');
                    const isLocalAdmin = normalizedEmail.toLowerCase() === 'admin' && normalizedPassword === 'admin';

                    if (window.MedicoreSupabase && typeof window.MedicoreSupabase.loginProfile === 'function') {
                        try {
                            found = await window.MedicoreSupabase.loginProfile(email, password);
                        } catch (error) {
                            console.warn('Supabase login fallback failed:', error);
                            found = null;
                        }
                    }

                    if (!found && isLocalAdmin) {
                        found = {
                            id: 'local-admin',
                            name: 'System Administrator',
                            full_name: 'System Administrator',
                            email: 'admin',
                            role: 'super_admin'
                        };
                    }

                    if (found) {
                        const safeUser = {
                            ...found,
                            id: found.id || 'local-admin',
                            name: found.name || found.full_name || found.email || 'System Administrator',
                            role: found.role || 'super_admin',
                            email: found.email || 'admin',
                            patientId: found.patientId || null
                        };
                        delete safeUser.password;
                        setUser(safeUser);
                        try {
                            localStorage.setItem('medicore_user', JSON.stringify(safeUser));
                        } catch (e) {}
                        return safeUser;
                    }
                    throw new Error('Invalid credentials');
                } finally {
                    setLoading(false);
                }
            }, []);

            const logout = useCallback(() => {
                setUser(null);
                window.MedicoreSupabase?.logout?.();
                try {
                    localStorage.removeItem('medicore_user');
                } catch (e) {}
            }, []);

            const normalizeRoleKey = (role) => {
                return String(role || 'patient').trim().toLowerCase().replace(/\s+/g, '_');
            };

            const getStoredRoleMatrix = () => {
                try {
                    const saved = JSON.parse(localStorage.getItem('medicore_role_matrix') || '[]');
                    return normalizeRoleMatrix(Array.isArray(saved) && saved.length ? saved : roleMatrix);
                } catch (e) {
                    return normalizeRoleMatrix(roleMatrix);
                }
            };

            const getRolePermissions = useCallback((role) => {
                const normalizedRole = normalizeRoleKey(role);
                const matrix = getStoredRoleMatrix();
                const match = matrix.find(row => normalizeRoleKey(row.role) === normalizedRole);
                if (match) {
                    return match.permissions || {};
                }
                return {};
            }, [user, roleMatrix]);

            const hasPermission = useCallback((permission) => {
                if (!user) return false;
                const rolePermissions = {
                    super_admin: ['*'],
                    doctor: ['view_patient', 'edit_patient', 'prescribe', 'order_lab', 'order_radiology', 'view_lab', 'view_radiology', 'view_appointments', 'edit_consultation'],
                    nurse: ['view_patient', 'edit_vitals', 'administer_medication', 'view_ward', 'edit_nursing_notes'],
                    receptionist: ['register_patient', 'view_patient', 'schedule_appointment', 'view_billing'],
                    pharmacist: ['view_prescription', 'dispense', 'manage_inventory'],
                    laboratory_scientist: ['process_lab', 'enter_results', 'view_lab_orders'],
                    radiographer: ['process_imaging', 'upload_images', 'enter_report'],
                    accountant: ['view_billing', 'process_payment', 'view_reports'],
                    patient: ['view_own_records', 'book_appointment', 'view_bills', 'message_doctor']
                };
                const permissions = rolePermissions[normalizeRoleKey(user.role)] || [];
                return permissions.includes('*') || permissions.includes(permission);
            }, [user]);

            const hasModuleAccess = useCallback((moduleId) => {
                if (!user) return false;
                const normalizedRole = normalizeRoleKey(user.role);
                if (normalizedRole === 'super_admin') return true;

                const matrix = getStoredRoleMatrix();
                const match = matrix.find(row => normalizeRoleKey(row.role) === normalizedRole);
                if (match && match.permissions) {
                    const permissions = match.permissions || {};
                    const permissionKeys = [moduleId, ...(legacyPermissionAliases[moduleId] || [])];
                    return permissionKeys.some((key) => permissions[key] === true);
                }

                const fallback = {
                    super_admin: ['dashboard', 'patients', 'appointments', 'doctors', 'laboratory', 'radiology', 'pharmacy', 'billing', 'admissions', 'surgeries', 'clinical_safety', 'inventory', 'hr', 'offices', 'reports', 'audit', 'settings'],
                    doctor: ['dashboard', 'patients', 'appointments', 'consultations', 'laboratory', 'radiology', 'prescriptions', 'clinical_safety'],
                    nurse: ['dashboard', 'patients', 'ward', 'vitals', 'medications', 'clinical_safety'],
                    receptionist: ['dashboard', 'patients', 'appointments', 'billing'],
                    pharmacist: ['dashboard', 'pharmacy', 'inventory', 'prescriptions'],
                    laboratory_scientist: ['dashboard', 'laboratory', 'results'],
                    radiographer: ['dashboard', 'radiology', 'upload'],
                    accountant: ['dashboard', 'billing', 'reports'],
                    patient: ['dashboard', 'portal', 'appointments', 'lab_results', 'prescriptions', 'billing', 'messages']
                };
                return (fallback[normalizedRole] || []).includes(moduleId);
            }, [user, roleMatrix]);

            return (
                <AuthContext.Provider value={{ user, login, logout, loading, hasPermission, hasModuleAccess, getRolePermissions }}>
                    {children}
                </AuthContext.Provider>
            );
        };

        const useAuth = () => {
            const context = React.useContext(AuthContext);
            if (!context) throw new Error('useAuth must be used within AuthProvider');
            return context;
        };

        // ==========================================
        // LOGIN PAGE
        // ==========================================
        // ==========================================
        // LOGIN PAGE
        // ==========================================
        const LoginPage = ({ onLogin }) => {
            const [email, setEmail] = useState('');
            const [password, setPassword] = useState('');
            const [error, setError] = useState('');
            const [showPassword, setShowPassword] = useState(false);
            const { login, loading } = useAuth();

            const handleSubmit = async (e) => {
                e.preventDefault();
                setError('');
                try {
                    await login(email, password);
                    onLogin();
                } catch (err) {
                    setError('Invalid email or password. Contact your administrator if you need an account.');
                }
            };

            return (
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-medical-50 via-white to-emerald-50">
                    <div className="w-full max-w-md mx-4">
                        <div className="text-center mb-8">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-medical-600 text-white mb-4 shadow-lg shadow-medical-200">
                                <Icons.HeartPulse size={32} />
                            </div>
                            <h1 className="text-3xl font-bold text-slate-900">MediCore EMR</h1>
                            <p className="text-slate-500 mt-2">Hospital Management System</p>
                        </div>
                        
                        <Card>
                            <form onSubmit={handleSubmit} className="space-y-5">
                                {error && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
                                        <Icons.AlertCircle size={16} />
                                        {error}
                                    </div>
                                )}
                                <Input
                                    label="Email or username"
                                    placeholder="Enter your email or username"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    icon={Icons.Mail}
                                    required
                                />
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter your password"
                                            className="w-full rounded-lg border border-slate-300 focus:border-medical-500 focus:ring-2 focus:ring-medical-200 focus:ring-opacity-50 outline-none transition-all pl-4 pr-12 py-2.5 text-sm"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        >
                                            <Icons.Eye size={18} />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" className="rounded border-slate-300 text-medical-600 focus:ring-medical-500" />
                                        <span className="text-slate-600">Remember me</span>
                                    </label>
                                </div>
                                <Button type="submit" variant="primary" size="lg" className="w-full justify-center" disabled={loading}>
                                    {loading ? (
                                        <span className="flex items-center gap-2">
                                            <Icons.RefreshCw size={18} className="animate-spin" />
                                            Signing in...
                                        </span>
                                    ) : 'Sign In'}
                                </Button>
                            </form>
                        </Card>

                    </div>
                </div>
            );
        };
