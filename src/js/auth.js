        // ==========================================
        // AUTH CONTEXT
        // ==========================================
        const AuthContext = React.createContext(null);

        const AuthProvider = ({ children }) => {
            const [user, setUser] = useState(() => {
                try {
                    const saved = localStorage.getItem('medicore_user');
                    return saved ? JSON.parse(saved) : null;
                } catch (e) {
                    return null;
                }
            });
            const [loading, setLoading] = useState(false);

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
                const permissions = rolePermissions[user.role] || [];
                return permissions.includes('*') || permissions.includes(permission);
            }, [user]);

            return (
                <AuthContext.Provider value={{ user, login, logout, loading, hasPermission }}>
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
                                    <button type="button" className="text-medical-600 hover:text-medical-700 font-medium">Forgot password?</button>
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

                        <div className="mt-6 rounded-xl border border-medical-200 bg-medical-50 px-4 py-3 text-center">
                            <p className="text-xs font-medium uppercase tracking-wide text-medical-700">Secure sign-in</p>
                            <p className="mt-1 text-sm text-medical-700">Development admin: username <strong>admin</strong>, password <strong>admin</strong>. Create staff from HR & Staff after signing in.</p>
                        </div>
                    </div>
                </div>
            );
        };
