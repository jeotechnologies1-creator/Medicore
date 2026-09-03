        // ==========================================
        // AUTH CONTEXT
        // ==========================================
        const AuthContext = React.createContext(null);

        const canonicalModuleKeys = [
            'dashboard', 'patients', 'appointments', 'doctors', 'laboratory', 'radiology',
            'pharmacy', 'billing', 'admissions', 'surgeries', 'clinical_safety', 'inventory',
            'hr', 'offices', 'reports', 'audit', 'settings', 'consultations', 'results',
            'upload', 'ward', 'vitals', 'medications', 'prescriptions', 'portal', 'messages',
            'documents', 'lab_results'
        ];

        const normalizeModulePermissionKey = (moduleId) => {
            const key = String(moduleId || '').trim().toLowerCase();
            const aliases = {
                appointment: 'appointments',
                appointments: 'appointments',
                doctor: 'doctors',
                doctors: 'doctors',
                lab: 'laboratory',
                labs: 'laboratory',
                laboratory: 'laboratory',
                imaging: 'radiology',
                radiology: 'radiology',
                pharmacy: 'pharmacy',
                inventory: 'inventory',
                admission: 'admissions',
                admissions: 'admissions',
                surgery: 'surgeries',
                surgeries: 'surgeries',
                clinicalsafety: 'clinical_safety',
                clinical_safety: 'clinical_safety',
                safety: 'clinical_safety',
                auditlog: 'audit',
                auditlogs: 'audit',
                audit: 'audit',
                report: 'reports',
                reports: 'reports',
                office: 'offices',
                offices: 'offices',
                medical_offices: 'offices',
                staff: 'hr',
                hr: 'hr',
                human_resources: 'hr',
                'hr_staff': 'hr',
                settings: 'settings',
                dashboard: 'dashboard',
                patient: 'patients',
                patients: 'patients',
                'medical offices': 'offices',
                'hr & staff': 'hr',
                'clinical safety': 'clinical_safety'
            };
            return aliases[key] || key;
        };

        const repairRoleMatrix = (matrix) => {
            const basePermissions = canonicalModuleKeys.reduce((acc, moduleKey) => {
                acc[moduleKey] = false;
                return acc;
            }, {});

            const seededSuperAdmin = { ...basePermissions, dashboard: true, patients: true, appointments: true, doctors: true, laboratory: true, radiology: true, pharmacy: true, billing: true, admissions: true, surgeries: true, clinical_safety: true, inventory: true, hr: true, offices: true, reports: true, audit: true, settings: true };

            return (Array.isArray(matrix) ? matrix : []).map((role) => {
                const rawPermissions = role && typeof role.permissions === 'object' ? role.permissions : {};
                const normalizedPermissions = Object.entries(rawPermissions).reduce((acc, [moduleKey, value]) => {
                    const normalizedKey = normalizeModulePermissionKey(moduleKey);
                    if (canonicalModuleKeys.includes(normalizedKey)) {
                        acc[normalizedKey] = Boolean(value);
                    }
                    return acc;
                }, { ...basePermissions });

                const computedPermissions = (String(role?.role || '').toLowerCase().includes('super') || String(role?.role || '').toLowerCase().includes('admin'))
                    ? { ...seededSuperAdmin, ...normalizedPermissions }
                    : { ...basePermissions, ...normalizedPermissions };

                return {
                    ...role,
                    permissions: computedPermissions
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
                    pharmacy: true,
                    billing: true,
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
                    doctors: false,
                    laboratory: true,
                    radiology: true,
                    pharmacy: false,
                    billing: false,
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
                    pharmacy: false,
                    billing: false,
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
                    pharmacy: true,
                    billing: false,
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
                    pharmacy: false,
                    billing: true,
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
                    return Array.isArray(saved) ? saved : defaultRoleMatrix;
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
                            const repaired = repairRoleMatrix(savedLocal);
                            setRoleMatrix(repaired);
                            localStorage.setItem('medicore_role_matrix', JSON.stringify(repaired));
                            return;
                        }

                        if (window.MedicoreSupabase && typeof window.MedicoreSupabase.loadSystemSettings === 'function') {
                            const remoteSettings = await window.MedicoreSupabase.loadSystemSettings();
                            const remoteMatrix = Array.isArray(remoteSettings.roleMatrix) ? remoteSettings.roleMatrix : [];
                            if (remoteMatrix.length) {
                                const repaired = repairRoleMatrix(remoteMatrix);
                                setRoleMatrix(repaired);
                                localStorage.setItem('medicore_role_matrix', JSON.stringify(repaired));
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
                    if (window.MedicoreSupabase && typeof window.MedicoreSupabase.loginProfile === 'function') {
                        found = await window.MedicoreSupabase.loginProfile(email, password);
                    }
                    if (found) {
                        const safeUser = {
                            ...found,
                            name: found.name || found.full_name || found.email,
                            role: found.role || 'super_admin',
                            email: found.email,
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
                    const candidates = Array.isArray(saved) && saved.length ? saved : roleMatrix;
                    const repaired = repairRoleMatrix(candidates);
                    const superAdmin = repaired.find(row => normalizeRoleKey(row.role) === 'super_admin');
                    if (!superAdmin || !superAdmin.permissions || !superAdmin.permissions.appointments || !superAdmin.permissions.reports || !superAdmin.permissions.audit) {
                        const forcedSuperAdmin = {
                            role: 'Super Admin',
                            permissions: canonicalModuleKeys.reduce((acc, moduleKey) => {
                                acc[moduleKey] = true;
                                return acc;
                            }, {})
                        };
                        const merged = repaired.some(row => normalizeRoleKey(row.role) === 'super_admin')
                            ? repaired.map(row => normalizeRoleKey(row.role) === 'super_admin' ? forcedSuperAdmin : row)
                            : [...repaired, forcedSuperAdmin];
                        localStorage.setItem('medicore_role_matrix', JSON.stringify(merged));
                        return merged;
                    }
                    if (JSON.stringify(repaired) !== JSON.stringify(candidates)) {
                        localStorage.setItem('medicore_role_matrix', JSON.stringify(repaired));
                    }
                    return repaired;
                } catch (e) {
                    return repairRoleMatrix(roleMatrix);
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
                const normalizedModule = normalizeModulePermissionKey(moduleId);
                if (normalizedRole === 'super_admin') {
                    return canonicalModuleKeys.includes(normalizedModule) || (normalizedModule === 'settings' || normalizedModule === 'dashboard');
                }

                const matrix = getStoredRoleMatrix();
                const match = matrix.find(row => normalizeRoleKey(row.role) === normalizedRole);
                if (match && match.permissions) {
                    return Boolean(match.permissions[normalizedModule] ?? match.permissions[moduleId]);
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
                return (fallback[normalizedRole] || []).includes(normalizedModule);
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
                <div className="login-shell min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-white to-sky-100">
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
