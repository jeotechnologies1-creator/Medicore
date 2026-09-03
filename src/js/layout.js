        // ==========================================
        // SIDEBAR NAVIGATION
        // ==========================================
        const Sidebar = ({ activeModule, onModuleChange, collapsed, onToggle, onLogout }) => {
            const { user } = useAuth();
            
            const getMenuItems = () => {
                const common = [
                    { id: 'dashboard', label: 'Dashboard', icon: Icons.LayoutDashboard },
                ];
                const roleMenus = {
                    super_admin: [
                        { id: 'patients', label: 'Patients', icon: Icons.Users },
                        { id: 'appointments', label: 'Appointments', icon: Icons.Calendar },
                        { id: 'doctors', label: 'Doctors', icon: Icons.Stethoscope },
                        { id: 'laboratory', label: 'Laboratory', icon: Icons.FlaskConical },
                        { id: 'radiology', label: 'Radiology', icon: Icons.Image },
                        { id: 'pharmacy', label: 'Pharmacy', icon: Icons.Pill },
                        { id: 'billing', label: 'Billing', icon: Icons.CreditCard },
                        { id: 'admissions', label: 'Admissions', icon: Icons.Bed },
                        { id: 'surgeries', label: 'Surgeries', icon: Icons.Scissors },
                        { id: 'clinical_safety', label: 'Clinical Safety', icon: Icons.Shield },
                        { id: 'inventory', label: 'Inventory', icon: Icons.Package },
                        { id: 'hr', label: 'HR & Staff', icon: Icons.UserCog },
                        { id: 'offices', label: 'Medical Offices', icon: Icons.Building2 },
                        { id: 'reports', label: 'Reports', icon: Icons.BarChart3 },
                        { id: 'audit', label: 'Audit Logs', icon: Icons.Shield },
                        { id: 'settings', label: 'Settings', icon: Icons.Settings },
                    ],
                    doctor: [
                        { id: 'patients', label: 'My Patients', icon: Icons.Users },
                        { id: 'appointments', label: 'Appointments', icon: Icons.Calendar },
                        { id: 'consultations', label: 'Consultations', icon: Icons.ClipboardList },
                        { id: 'laboratory', label: 'Lab Orders', icon: Icons.FlaskConical },
                        { id: 'radiology', label: 'Radiology', icon: Icons.Image },
                        { id: 'prescriptions', label: 'Prescriptions', icon: Icons.Pill },
                        { id: 'clinical_safety', label: 'Clinical Safety', icon: Icons.Shield },
                    ],
                    nurse: [
                        { id: 'patients', label: 'Patients', icon: Icons.Users },
                        { id: 'ward', label: 'Ward Management', icon: Icons.Bed },
                        { id: 'vitals', label: 'Vital Signs', icon: Icons.Activity },
                        { id: 'medications', label: 'Medications', icon: Icons.Syringe },
                        { id: 'clinical_safety', label: 'Clinical Safety', icon: Icons.Shield },
                    ],
                    receptionist: [
                        { id: 'patients', label: 'Patient Registration', icon: Icons.UserPlus },
                        { id: 'appointments', label: 'Appointments', icon: Icons.Calendar },
                        { id: 'billing', label: 'Billing', icon: Icons.CreditCard },
                    ],
                    laboratory_scientist: [
                        { id: 'laboratory', label: 'Lab Orders', icon: Icons.FlaskConical },
                        { id: 'results', label: 'Results Entry', icon: Icons.ClipboardList },
                    ],
                    radiographer: [
                        { id: 'radiology', label: 'Imaging Orders', icon: Icons.Image },
                        { id: 'upload', label: 'Upload Images', icon: Icons.Upload },
                    ],
                    pharmacist: [
                        { id: 'pharmacy', label: 'Dispensary', icon: Icons.Pill },
                        { id: 'inventory', label: 'Inventory', icon: Icons.Package },
                        { id: 'prescriptions', label: 'Prescriptions', icon: Icons.ClipboardList },
                    ],
                    accountant: [
                        { id: 'billing', label: 'Billing', icon: Icons.CreditCard },
                        { id: 'payments', label: 'Payments', icon: Icons.DollarSign },
                        { id: 'insurance', label: 'Insurance', icon: Icons.Shield },
                        { id: 'reports', label: 'Reports', icon: Icons.BarChart3 },
                    ],
                    patient: [
                        { id: 'portal', label: 'My Records', icon: Icons.FolderOpen },
                        { id: 'appointments', label: 'My Appointments', icon: Icons.Calendar },
                        { id: 'lab_results', label: 'Lab Results', icon: Icons.FlaskConical },
                        { id: 'prescriptions', label: 'Prescriptions', icon: Icons.Pill },
                        { id: 'billing', label: 'My Bills', icon: Icons.CreditCard },
                        { id: 'messages', label: 'Messages', icon: Icons.MessageSquare },
                    ]
                };

                const role = user?.role || 'patient';
                const allowed = new Set((roleMenus[role] || []).map((item) => item.id));
                return [...common, ...(roleMenus[role] || [])].filter((item) => role === 'super_admin' || allowed.has(item.id));
            };

            const menuItems = getMenuItems();

            return (
                <div className={(collapsed ? 'w-16' : 'w-64') + ' bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-r border-slate-800 flex flex-col transition-all duration-300 h-screen sticky top-0 z-40 shadow-[0_0_30px_rgba(2,6,23,0.35)]'}>
                    <div className="h-20 flex items-center px-4 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-sky-950/40 to-slate-900">
                        <div className={'flex items-center gap-3 ' + (collapsed ? 'justify-center w-full' : '')}>
                            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-400 via-cyan-500 to-sky-700 flex items-center justify-center text-white flex-shrink-0 shadow-lg shadow-sky-500/30">
                                <Icons.HeartPulse size={22} />
                            </div>
                            {!collapsed && (
                                <div>
                                    <h1 className="font-bold text-white text-lg leading-tight">MediCore</h1>
                                    <p className="text-[10px] uppercase tracking-[0.2em] text-sky-200/80">Health Platform</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto sidebar-scroll py-4 px-3 space-y-1">
                        {menuItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => onModuleChange(item.id)}
                                className={'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ' + (activeModule === item.id ? 'bg-sky-500/10 text-white border-sky-400/20 shadow-lg shadow-sky-500/10' : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border-transparent') + ' ' + (collapsed ? 'justify-center' : '')}
                                title={collapsed ? item.label : ''}
                            >
                                <item.icon size={20} className={activeModule === item.id ? 'text-sky-300' : 'text-slate-400'} />
                                {!collapsed && <span>{item.label}</span>}
                            </button>
                        ))}
                    </div>

                    <div className="p-4 border-t border-slate-800 bg-slate-950/60">
                        <button
                            onClick={onToggle}
                            className={'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800/80 transition-all border border-transparent ' + (collapsed ? 'justify-center' : '')}
                        >
                            {collapsed ? <Icons.PanelLeft size={18} /> : <><Icons.PanelLeft size={18} className="rotate-180" /> <span>Collapse</span></>}
                        </button>
                        <button
                            onClick={onLogout}
                            className={'w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-xl text-sm text-red-300 hover:bg-red-500/10 transition-all border border-transparent ' + (collapsed ? 'justify-center' : '')}
                        >
                            <Icons.LogOut size={18} />
                            {!collapsed && <span>Sign Out</span>}
                        </button>
                    </div>
                </div>
            );
        };

        // ==========================================
        // HEADER
        // ==========================================
        const Header = ({ onSearch, notifications, onNotificationClick, onMarkAllNotificationsRead, onNavigate, onLogout }) => {
            const { user } = useAuth();
            const [showNotifications, setShowNotifications] = useState(false);
            const [showProfile, setShowProfile] = useState(false);
            const [searchQuery, setSearchQuery] = useState('');
            const unreadCount = notifications.filter(n => !n.read).length;

            const handleSearch = (e) => {
                setSearchQuery(e.target.value);
                onSearch && onSearch(e.target.value);
            };

            return (
                <header className="h-20 bg-slate-950/70 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-30 px-6 flex items-center justify-between shadow-[0_10px_30px_rgba(2,6,23,0.25)]">
                    <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2 shadow-inner shadow-slate-950/60">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-cyan-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
                                <Icons.HeartPulse size={18} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-[0.24em] text-sky-200/80">MediCore</p>
                                <p className="text-sm font-semibold text-slate-100">Clinical Intelligence Suite</p>
                            </div>
                        </div>
                        <div className="w-[min(28rem,45vw)]">
                            <SearchBar
                                value={searchQuery}
                                onChange={handleSearch}
                                placeholder="Search patients, records, appointments..."
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <button
                                onClick={() => setShowNotifications(!showNotifications)}
                                className="relative p-2.5 rounded-xl border border-slate-700 bg-slate-900/60 hover:bg-slate-800 transition-colors"
                            >
                                <Icons.Bell size={20} className="text-slate-200" />
                                {unreadCount > 0 && (
                                    <span className="absolute top-1 right-1 w-5 h-5 bg-gradient-to-br from-rose-500 to-red-600 text-white text-[10px] rounded-full flex items-center justify-center notification-badge shadow-lg shadow-red-500/20">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                            {showNotifications && (
                                <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900/95 rounded-2xl shadow-[0_22px_50px_rgba(2,6,23,0.4)] border border-slate-700 py-2 dropdown-menu z-50">
                                    <div className="px-4 py-2 border-b border-slate-700 flex items-center justify-between">
                                        <span className="font-semibold text-sm text-slate-100">Notifications</span>
                                        <button onClick={onMarkAllNotificationsRead} className="text-xs text-sky-300 hover:underline">Mark all read</button>
                                    </div>
                                    <div className="max-h-80 overflow-y-auto">
                                        {notifications.slice(0, 8).map((n) => (
                                            <div key={n.id} className={'px-4 py-3 hover:bg-slate-800/80 cursor-pointer border-b border-slate-800 ' + (!n.read ? 'bg-sky-500/5' : '')} onClick={() => { onNotificationClick && onNotificationClick(n); setShowNotifications(false); }}>
                                                <div className="flex items-start gap-3">
                                                    <div className={'w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ' + (!n.read ? 'bg-sky-400' : 'bg-slate-500')} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-slate-100 truncate">{n.title}</p>
                                                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                                                        <p className="text-xs text-slate-500 mt-1">{formatDateTime(n.timestamp)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="px-4 py-2 border-t border-slate-700 text-center">
                                        <button onClick={() => { onNavigate?.('audit'); setShowNotifications(false); }} className="text-sm text-sky-300 hover:underline">View audit log</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="relative">
                            <button
                                onClick={() => setShowProfile(!showProfile)}
                                className="flex items-center gap-3 p-1.5 rounded-xl border border-slate-700 bg-slate-900/60 hover:bg-slate-800 transition-colors"
                            >
                                <Avatar name={user?.name} size="sm" />
                                <div className="hidden md:block text-left">
                                    <p className="text-sm font-medium text-slate-100 leading-tight">{user?.name}</p>
                                    <p className="text-xs text-slate-400 capitalize">{user?.role?.replace('_', ' ')}</p>
                                </div>
                                <Icons.ChevronDown size={16} className="text-slate-400" />
                            </button>
                            {showProfile && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900/95 rounded-2xl shadow-[0_20px_40px_rgba(2,6,23,0.35)] border border-slate-700 py-2 dropdown-menu z-50">
                                    <div className="px-4 py-3 border-b border-slate-700">
                                        <p className="font-medium text-sm text-slate-100">{user?.name}</p>
                                        <p className="text-xs text-slate-400">{user?.email}</p>
                                    </div>
                                    <button onClick={() => { onNavigate?.('patients'); setShowProfile(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 flex items-center gap-2">
                                        <Icons.User size={16} /> Profile
                                    </button>
                                    <button onClick={() => { onNavigate?.('settings'); setShowProfile(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 flex items-center gap-2">
                                        <Icons.Settings size={16} /> Settings
                                    </button>
                                    <div className="border-t border-slate-700 mt-1 pt-1">
                                        <button onClick={onLogout} className="w-full text-left px-4 py-2 text-sm text-red-300 hover:bg-red-500/10 flex items-center gap-2">
                                            <Icons.LogOut size={16} /> Sign Out
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>
            );
        };
