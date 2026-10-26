        // ==========================================
        // SIDEBAR NAVIGATION
        // ==========================================
        const Sidebar = ({ activeModule, onModuleChange, collapsed, onToggle, onLogout, theme, mobileOpen = false, onClose }) => {
            const { user, hasModuleAccess } = useAuth();
            const showCollapsed = collapsed && !mobileOpen;
            const sidebarRef = React.useRef(null);
            useEffect(() => {
                if (!mobileOpen) return undefined;
                sidebarRef.current?.querySelector('button')?.focus();
                const trapFocus = (event) => {
                    if (event.key !== 'Tab' || !window.matchMedia('(max-width: 1023px)').matches) return;
                    const items = Array.from(sidebarRef.current?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])') || []).filter((item) => item.getClientRects().length > 0);
                    if (!items.length) return;
                    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
                    else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
                };
                window.addEventListener('keydown', trapFocus);
                return () => window.removeEventListener('keydown', trapFocus);
            }, [mobileOpen]);
            
            const getMenuItems = () => {
                const common = [
                    { id: 'dashboard', label: 'Dashboard', icon: Icons.LayoutDashboard },
                ];
                const roleMenus = {
                    super_admin: [
                        { id: 'patients', label: 'Patients', icon: Icons.Users },
                        { id: 'records', label: 'Health Information Management (HIM)', icon: Icons.FolderOpen },
                        { id: 'appointments', label: 'Appointments', icon: Icons.Calendar },
                        { id: 'doctors', label: 'Doctors', icon: Icons.Stethoscope },
                        { id: 'laboratory', label: 'Laboratory', icon: Icons.FlaskConical },
                        { id: 'radiology', label: 'Radiology', icon: Icons.Image },
                        { id: 'clinical_workflows', label: 'Clinical Workflows', icon: Icons.ClipboardList },
                        { id: 'clinical_decision_support', label: 'Clinical Support', icon: Icons.ShieldCheck },
                        { id: 'operations', label: 'Operations', icon: Icons.Activity },
                        { id: 'procurement', label: 'Procurement', icon: Icons.Package },
                        { id: 'referrals', label: 'Referrals', icon: Icons.UserCheck },
                        { id: 'workforce', label: 'Workforce', icon: Icons.Users },
                        { id: 'pharmacy', label: 'Pharmacy', icon: Icons.Pill },
                        { id: 'billing', label: 'Billing', icon: Icons.CreditCard },
                        { id: 'insurance', label: 'Insurance', icon: Icons.Shield },
                        { id: 'payments', label: 'Payments', icon: Icons.DollarSign },
                        { id: 'documents', label: 'Documents', icon: Icons.FileText },
                        { id: 'compliance', label: 'Compliance', icon: Icons.ShieldCheck },
                        { id: 'admissions', label: 'Admissions', icon: Icons.Bed },
                        { id: 'surgeries', label: 'Surgeries', icon: Icons.Scissors },
                        { id: 'clinical_safety', label: 'Clinical Safety', icon: Icons.Shield },
                        { id: 'inventory', label: 'Inventory', icon: Icons.Package },
                        { id: 'hr', label: 'HR & Staff', icon: Icons.UserCog },
                        { id: 'offices', label: 'Medical Offices', icon: Icons.Building2 },
                        { id: 'organization', label: 'Organization', icon: Icons.Building2 },
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
                        { id: 'clinical_workflows', label: 'Clinical Workflows', icon: Icons.ClipboardList },
                        { id: 'prescriptions', label: 'Prescriptions', icon: Icons.Pill },
                        { id: 'admissions', label: 'Admission Requests', icon: Icons.Bed },
                        { id: 'clinical_safety', label: 'Clinical Safety', icon: Icons.Shield },
                    ],
                    nurse: [
                        { id: 'patients', label: 'Patients', icon: Icons.Users },
                        { id: 'ward', label: 'Ward Management', icon: Icons.Bed },
                        { id: 'vitals', label: 'Vital Signs', icon: Icons.Activity },
                        { id: 'clinical_workflows', label: 'Clinical Workflows', icon: Icons.ClipboardList },
                        { id: 'medications', label: 'Medications', icon: Icons.Syringe },
                        { id: 'clinical_safety', label: 'Clinical Safety', icon: Icons.Shield },
                    ],
                    receptionist: [
                        { id: 'patients', label: 'Patients', icon: Icons.Users },
                        { id: 'appointments', label: 'Appointments', icon: Icons.Calendar },
                        { id: 'clinical_workflows', label: 'Emergency Registration', icon: Icons.ClipboardList },
                    ],
                    records_officer: [
                        { id: 'records', label: 'Health Information Management (HIM)', icon: Icons.FolderOpen },
                        { id: 'clinical_workflows', label: 'Encounter Registration', icon: Icons.ClipboardList },
                    ],
                    surgeon: [
                        { id: 'patients', label: 'Patients', icon: Icons.Users },
                        { id: 'clinical_workflows', label: 'Clinical Workflows', icon: Icons.ClipboardList },
                        { id: 'surgeries', label: 'Surgery / Theatre', icon: Icons.Scissors },
                        { id: 'clinical_safety', label: 'Clinical Safety', icon: Icons.Shield },
                    ],
                    specialist: [
                        { id: 'patients', label: 'Patients', icon: Icons.Users },
                        { id: 'appointments', label: 'Appointments', icon: Icons.Calendar },
                        { id: 'consultations', label: 'Consultations', icon: Icons.ClipboardList },
                        { id: 'laboratory', label: 'Lab Orders', icon: Icons.FlaskConical },
                        { id: 'radiology', label: 'Radiology', icon: Icons.Image },
                        { id: 'clinical_workflows', label: 'Clinical Workflows', icon: Icons.ClipboardList },
                        { id: 'prescriptions', label: 'Prescriptions', icon: Icons.Pill },
                    ],
                    theatre_staff: [
                        { id: 'surgeries', label: 'Surgery / Theatre', icon: Icons.Scissors },
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
                return [...common, ...(roleMenus[role] || [])].filter((item) =>
                    (item.id === 'dashboard' || allowed.has(item.id)) && hasModuleAccess(item.id)
                );
            };

            const menuItems = getMenuItems();

            return (
                <aside ref={sidebarRef} id="onemed-main-navigation" className={(showCollapsed ? 'w-16' : 'w-64') + ' sidebar-shell flex flex-col transition-all duration-300 h-screen sticky top-0 z-40 mobile-drawer ' + (mobileOpen ? 'is-open' : '')} aria-label="Main navigation">
                    <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 sidebar-brand">
                        <div className={'flex items-center gap-3 ' + (showCollapsed ? 'justify-center w-full' : '')}>
                            <div className="w-10 h-10 rounded-xl bg-medical-600 flex items-center justify-center text-white flex-shrink-0 shadow-lg shadow-medical-500/20">
                                <Icons.HeartPulse size={22} />
                            </div>
                            {!showCollapsed && (
                                <div>
                                    <h1 className="font-bold text-slate-900 text-lg leading-tight">OneMed</h1>
                                    <p className="text-xs text-slate-400">EMR System</p>
                                </div>
                            )}
                        </div>
                        <button type="button" className="mobile-nav-close" onClick={onClose} aria-label="Close navigation menu"><Icons.X size={20} /></button>
                    </div>

                    <nav className="flex-1 overflow-y-auto sidebar-scroll py-4 px-3 space-y-1" aria-label="Hospital modules">
                        {menuItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => onModuleChange(item.id)}
                                aria-current={activeModule === item.id ? 'page' : undefined}
                                className={'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ' + (activeModule === item.id ? 'bg-medical-50 text-medical-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900') + ' ' + (showCollapsed ? 'justify-center' : '')}
                                title={showCollapsed ? item.label : ''}
                            >
                                <item.icon size={20} className={activeModule === item.id ? 'text-medical-600' : 'text-slate-400'} />
                                {!showCollapsed && <span>{item.label}</span>}
                            </button>
                        ))}
                    </nav>

                    <div className="p-4 border-t border-slate-100">
                        <button
                            onClick={onToggle}
                            aria-label={showCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                            className={'desktop-sidebar-toggle w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-all ' + (showCollapsed ? 'justify-center' : '')}
                        >
                            {showCollapsed ? <Icons.PanelLeft size={18} /> : <><Icons.PanelLeft size={18} className="rotate-180" /> <span>Collapse</span></>}
                        </button>
                        <button
                            type="button"
                            onClick={onLogout}
                            className={'w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-all ' + (showCollapsed ? 'justify-center' : '')}
                        >
                            <Icons.LogOut size={18} />
                            {!showCollapsed && <span>Sign Out</span>}
                        </button>
                    </div>
                </aside>
            );
        };

        // ==========================================
        // HEADER
        // ==========================================
        const Header = ({ onSearch, notifications, onNotificationClick, onMarkAllNotificationsRead, onNavigate, onLogout, theme, onToggleTheme, onMenuClick, activeModule, menuOpen = false }) => {
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
                <header className="luxury-header sticky top-0 z-30 px-6 flex items-center justify-between">
                    <div className="header-main flex items-center gap-4 flex-1 min-w-0">
                        <button type="button" id="onemed-open-menu" className="mobile-menu-button" onClick={onMenuClick} aria-label="Open navigation menu" aria-controls="onemed-main-navigation" aria-expanded={menuOpen}><Icons.Menu size={20} /></button>
                        <div className="header-page-title" aria-live="polite">{String(activeModule || 'dashboard').replaceAll('_', ' ')}</div>
                        <div className="brand-lockup hidden lg:flex items-center gap-3 pr-4 border-r border-white/10">
                            <div className="brand-mark">
                                <Icons.HeartPulse size={18} />
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-[0.28em] text-medical-200">Care command</p>
                                <h1 className="text-base font-semibold text-white">OneMed</h1>
                            </div>
                        </div>
                        <div className="header-search-wrap w-full max-w-xl min-w-0">
                            <SearchBar
                                value={searchQuery}
                                onChange={handleSearch}
                                placeholder="Search patients, records, appointments..."
                                className="header-search"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onToggleTheme}
                            className="theme-toggle"
                            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                            aria-pressed={theme === 'dark'}
                        >
                            <span className={`theme-toggle-thumb ${theme === 'dark' ? 'right-1' : 'left-1'}`} />
                            <span className="theme-toggle-label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
                        </button>

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowNotifications(!showNotifications)}
                                className="relative p-2.5 rounded-xl header-icon-button transition-colors"
                                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                                aria-expanded={showNotifications}
                            >
                                <Icons.Bell size={18} />
                                {unreadCount > 0 && (
                                <span className="absolute top-1 right-1 min-w-5 h-5 px-1 bg-red-600 text-white text-[10px] rounded-full flex items-center justify-center notification-badge">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                            {showNotifications && (
                                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 py-2 dropdown-menu z-50">
                                    <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                                        <span className="font-semibold text-sm">Notifications</span>
                                        <button onClick={onMarkAllNotificationsRead} className="text-xs text-medical-600 hover:underline">Mark all read</button>
                                    </div>
                                    <div className="max-h-80 overflow-y-auto">
                                        {notifications.slice(0, 8).map((n) => (
                                            <div key={n.id} className={'px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 ' + (!n.read ? 'bg-medical-50/50' : '')} onClick={() => { onNotificationClick && onNotificationClick(n); setShowNotifications(false); }}>
                                                <div className="flex items-start gap-3">
                                                    <div className={'w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ' + (!n.read ? 'bg-medical-500' : 'bg-slate-300')} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-slate-900 truncate">{n.title}</p>
                                                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                                                        <p className="text-xs text-slate-400 mt-1">{formatDateTime(n.timestamp)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="px-4 py-2 border-t border-slate-100 text-center">
                                        <button onClick={() => { onNavigate?.('audit'); setShowNotifications(false); }} className="text-sm text-medical-600 hover:underline">View audit log</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowProfile(!showProfile)}
                                className="flex items-center gap-3 p-1.5 rounded-xl header-profile-button transition-colors"
                                aria-label="Open profile menu"
                                aria-expanded={showProfile}
                            >
                                <Avatar name={user?.name} size="sm" />
                                <div className="hidden md:block text-left">
                                    <p className="text-sm font-semibold text-white leading-tight">{user?.name}</p>
                                    <p className="text-[11px] text-medical-100 uppercase tracking-[0.14em]">{user?.role?.replace('_', ' ')}</p>
                                </div>
                                <Icons.ChevronDown size={16} className="text-medical-100" />
                            </button>
                            {showProfile && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 dropdown-menu z-50">
                                    <div className="px-4 py-3 border-b border-slate-100">
                                        <p className="font-medium text-sm text-slate-900">{user?.name}</p>
                                        <p className="text-xs text-slate-500">{user?.email}</p>
                                    </div>
                                    <button onClick={() => { onNavigate?.('patients'); setShowProfile(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                        <Icons.User size={16} /> Profile
                                    </button>
                                    <button onClick={() => { onNavigate?.('settings'); setShowProfile(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                        <Icons.Settings size={16} /> Settings
                                    </button>
                                    <div className="border-t border-slate-100 mt-1 pt-1">
                                        <button onClick={onLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
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
