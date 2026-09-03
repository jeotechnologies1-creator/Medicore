
        const { useState, useEffect, useCallback, useRef, useMemo } = React;

        // ==========================================
        // DATABASE & SEED DATA
        // ==========================================
        const seedData = window.MediCoreSeedData || {};

        const hydrateSeedData = () => {
            const store = window.MedicoreSupabase && typeof window.MedicoreSupabase.getStore === 'function'
                ? window.MedicoreSupabase.getStore()
                : {};
            const tables = ['users', 'patients', 'appointments', 'labOrders', 'radiologyOrders', 'prescriptions', 'pharmacyInventory', 'billing', 'admissions', 'surgeries', 'notifications', 'auditLogs', 'vitals', 'wards'];
            tables.forEach((table) => {
                if (Array.isArray(store[table]) && store[table].length > 0) {
                    seedData[table] = store[table];
                }
            });
            return seedData;
        };

        const persistSeedTable = (table, rows) => {
            const nextRows = Array.isArray(rows) ? rows : [];
            if (seedData) seedData[table] = nextRows;
            if (window.MedicoreSupabase && typeof window.MedicoreSupabase.saveStore === 'function') {
                const store = window.MedicoreSupabase.getStore();
                store[table] = nextRows;
                window.MedicoreSupabase.saveStore(store);
            }
            return nextRows;
        };

// ==========================================
        // UTILITY FUNCTIONS
        // ==========================================
        const formatDate = (dateStr) => {
            if (!dateStr) return 'N/A';
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        };

        const formatDateTime = (dateStr) => {
            if (!dateStr) return 'N/A';
            const d = new Date(dateStr);
            return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        };

        const formatCurrency = (amount) => {
            const num = parseFloat(amount);
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
        };

        const calculateAge = (dob) => {
            const birthDate = new Date(dob);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
            return age;
        };

        const getStatusColor = (status) => {
            const colors = {
                active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                inactive: 'bg-slate-100 text-slate-600 border-slate-200',
                pending: 'bg-amber-100 text-amber-700 border-amber-200',
                completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                cancelled: 'bg-red-100 text-red-700 border-red-200',
                discharged: 'bg-blue-100 text-blue-700 border-blue-200',
                'in-progress': 'bg-medical-100 text-medical-700 border-medical-200',
                scheduled: 'bg-violet-100 text-violet-700 border-violet-200',
                critical: 'bg-red-100 text-red-700 border-red-200',
                urgent: 'bg-orange-100 text-orange-700 border-orange-200',
                stat: 'bg-red-100 text-red-700 border-red-200 animate-pulse',
                paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                partial: 'bg-amber-100 text-amber-700 border-amber-200',
                overdue: 'bg-red-100 text-red-700 border-red-200',
                available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                occupied: 'bg-red-100 text-red-700 border-red-200',
                maintenance: 'bg-slate-100 text-slate-600 border-slate-200',
                reserved: 'bg-violet-100 text-violet-700 border-violet-200',
                normal: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                high: 'bg-red-100 text-red-700 border-red-200',
                low: 'bg-amber-100 text-amber-700 border-amber-200',
                'no-show': 'bg-slate-100 text-slate-600 border-slate-200'
            };
            return colors[status] || 'bg-slate-100 text-slate-600 border-slate-200';
        };

        // ==========================================
        // ICON COMPONENTS (Inline SVG)
        // ==========================================
        const IconActivity = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
        );

        const IconAlertCircle = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
        );

        const IconArrowLeft = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
        );

        const IconBarChart3 = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
            </svg>
        );

        const IconBed = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>
            </svg>
        );

        const IconBell = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
        );

        const IconBookOpen = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
        );

        const IconBox = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
        );

        const IconBriefcase = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
        );

        const IconBuilding2 = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M6 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
            </svg>
        );

        const IconCalendar = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
        );

        const IconCamera = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>
            </svg>
        );

        const IconCheck = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <polyline points="20 6 9 17 4 12"/>
            </svg>
        );

        const IconCheckCircle = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
        );

        const IconChevronDown = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        );

        const IconChevronRight = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <polyline points="9 18 15 12 9 6"/>
            </svg>
        );

        const IconClipboardList = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14h.01"/><path d="M9 17h.01"/><path d="M12 16l-4-4"/><path d="M16 16l-4-4"/>
            </svg>
        );

        const IconClock = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
        );

        const IconCreditCard = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
        );

        const IconDollarSign = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
        );

        const IconDownload = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
        );

        const IconEye = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
        );

        const IconFileText = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
        );

        const IconFilter = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
        );

        const IconFlaskConical = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M10 2v7.31"/><path d="M14 2v7.31"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 0 1 1.8 3.8H8.7a6.5 6.5 0 0 1 1.8-3.8"/><path d="M5.52 16h12.96a3 3 0 0 1-2.6 2.2l-.6.1H8.72l-.6-.1a3 3 0 0 1-2.6-2.2z"/>
            </svg>
        );

        const IconFolderOpen = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4.5a2 2 0 0 1 1.6.8l1.1 1.5H18a2 2 0 0 1 2 2v2"/>
            </svg>
        );

        const IconHeart = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
        );

        const IconHeartPulse = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>
            </svg>
        );

        const IconHome = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
        );

        const IconImage = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
        );

        const IconLayoutDashboard = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>
            </svg>
        );

        const IconLock = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
        );

        const IconLogOut = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
        );

        const IconMail = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
        );

        const IconMapPin = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
        );

        const IconMenu = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
        );

        const IconMessageSquare = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
        );

        const IconMicroscope = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M6 18h12"/><path d="M6 22h12"/><path d="M6 12a6 6 0 0 1 12 0v6H6v-6z"/><path d="M12 2v4"/><path d="M9 6h6"/><circle cx="12" cy="12" r="1"/>
            </svg>
        );

        const IconMoreHorizontal = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
            </svg>
        );

        const IconPackage = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
        );

        const IconPanelLeft = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>
            </svg>
        );

        const IconPill = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m9 11 4 4"/>
            </svg>
        );

        const IconPlus = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
        );

        const IconPrinter = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>
            </svg>
        );

        const IconQrCode = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M15 21v.01"/><path d="M15 15h.01"/><path d="M18 15h.01"/><path d="M21 12v-3a2 2 0 0 0-2-2h-3"/>
            </svg>
        );

        const IconRefreshCw = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
            </svg>
        );

        const IconSave = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
        );

        const IconScanLine = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>
            </svg>
        );

        const IconScissors = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.47" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>
            </svg>
        );

        const IconSearch = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
        );

        const IconSend = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
        );

        const IconSettings = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
            </svg>
        );

        const IconShield = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
        );

        const IconShieldAlert = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
        );

        const IconShoppingCart = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
        );

        const IconStethoscope = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M4.5 10.5 2 13"/><path d="M12 2a9.04 9.04 0 0 1 9 9 9 9 0 0 1-9 9 9 9 0 0 1-9-9 9.04 9.04 0 0 1 9-9Z"/><path d="M8 15a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2 2 2 0 0 0-2 2v4a2 2 0 0 0 2 2Z"/><path d="M16 15a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2 2 2 0 0 0-2 2v4a2 2 0 0 0 2 2Z"/>
            </svg>
        );

        const IconSyringe = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m10 17-5 5"/><path d="m14 14-1.5 1.5"/>
            </svg>
        );

        const IconThermometer = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
            </svg>
        );

        const IconTrash2 = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
        );

        const IconTrendingUp = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
            </svg>
        );

        const IconUpload = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
        );

        const IconUser = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
        );

        const IconUserCheck = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>
            </svg>
        );

        const IconUserCog = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m19 8 .8.8a2 2 0 0 1 0 2.8l-2.8 2.8a2 2 0 0 1-2.8 0l-.8-.8a2 2 0 0 1 0-2.8l2.8-2.8a2 2 0 0 1 2.8 0Z"/>
            </svg>
        );

        const IconUserPlus = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
        );

        const IconUsers = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>
            </svg>
        );

        const IconX = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        );

        const IconXCircle = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
        );

        const IconZap = ({ size = 20, className = '' }) => (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
        );

        // Icon mapping object
        const Icons = {
            Activity: IconActivity,
            AlertCircle: IconAlertCircle,
            ArrowLeft: IconArrowLeft,
            BarChart3: IconBarChart3,
            Bed: IconBed,
            Bell: IconBell,
            BookOpen: IconBookOpen,
            Box: IconBox,
            Briefcase: IconBriefcase,
            Building2: IconBuilding2,
            Calendar: IconCalendar,
            Camera: IconCamera,
            Check: IconCheck,
            CheckCircle: IconCheckCircle,
            ChevronDown: IconChevronDown,
            ChevronRight: IconChevronRight,
            ClipboardList: IconClipboardList,
            Clock: IconClock,
            CreditCard: IconCreditCard,
            DollarSign: IconDollarSign,
            Download: IconDownload,
            Eye: IconEye,
            FileText: IconFileText,
            Filter: IconFilter,
            FlaskConical: IconFlaskConical,
            FolderOpen: IconFolderOpen,
            Heart: IconHeart,
            HeartPulse: IconHeartPulse,
            Home: IconHome,
            Image: IconImage,
            LayoutDashboard: IconLayoutDashboard,
            Lock: IconLock,
            LogOut: IconLogOut,
            Mail: IconMail,
            MapPin: IconMapPin,
            Menu: IconMenu,
            MessageSquare: IconMessageSquare,
            Microscope: IconMicroscope,
            MoreHorizontal: IconMoreHorizontal,
            Package: IconPackage,
            PanelLeft: IconPanelLeft,
            Pill: IconPill,
            Plus: IconPlus,
            Printer: IconPrinter,
            QrCode: IconQrCode,
            RefreshCw: IconRefreshCw,
            Save: IconSave,
            ScanLine: IconScanLine,
            Scissors: IconScissors,
            Search: IconSearch,
            Send: IconSend,
            Settings: IconSettings,
            Shield: IconShield,
            ShieldAlert: IconShieldAlert,
            ShoppingCart: IconShoppingCart,
            Stethoscope: IconStethoscope,
            Syringe: IconSyringe,
            Thermometer: IconThermometer,
            Trash2: IconTrash2,
            TrendingUp: IconTrendingUp,
            Upload: IconUpload,
            User: IconUser,
            UserCheck: IconUserCheck,
            UserCog: IconUserCog,
            UserPlus: IconUserPlus,
            Users: IconUsers,
            X: IconX,
            XCircle: IconXCircle,
            Zap: IconZap
        };

        // ==========================================
        // UI COMPONENTS
        // ==========================================
        const Button = ({ children, variant = 'primary', size = 'md', className = '', onClick, disabled, type = 'button', icon: Icon }) => {
            const variants = {
                primary: 'bg-medical-600 text-white hover:bg-medical-700 border-transparent shadow-sm hover:shadow-md',
                secondary: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-sm',
                danger: 'bg-red-600 text-white hover:bg-red-700 border-transparent shadow-sm',
                success: 'bg-emerald-600 text-white hover:bg-emerald-700 border-transparent shadow-sm',
                ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent',
                outline: 'bg-transparent border-slate-300 text-slate-700 hover:bg-slate-50'
            };
            const sizes = {
                sm: 'px-3 py-1.5 text-xs',
                md: 'px-4 py-2 text-sm',
                lg: 'px-6 py-3 text-base'
            };
            return (
                <button
                    type={type}
                    onClick={onClick}
                    disabled={disabled}
                    className={'inline-flex items-center gap-2 rounded-lg border font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ' + variants[variant] + ' ' + sizes[size] + ' ' + className}
                >
                    {Icon && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
                    {children}
                </button>
            );
        };

        const Badge = ({ children, variant = 'default', className = '' }) => {
            const variants = {
                default: 'bg-slate-100 text-slate-700 border-slate-200',
                success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                warning: 'bg-amber-100 text-amber-700 border-amber-200',
                danger: 'bg-red-100 text-red-700 border-red-200',
                info: 'bg-medical-100 text-medical-700 border-medical-200',
                purple: 'bg-violet-100 text-violet-700 border-violet-200'
            };
            return (
                <span className={'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ' + variants[variant] + ' ' + className}>
                    {children}
                </span>
            );
        };

        const Card = ({ children, className = '', title, subtitle, action, noPadding = false }) => (
            <div className={'bg-white rounded-xl border border-slate-200 shadow-sm hover-lift ' + className}>
                {(title || subtitle || action) && (
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
                            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
                        </div>
                        {action && <div>{action}</div>}
                    </div>
                )}
                <div className={noPadding ? '' : 'p-6'}>{children}</div>
            </div>
        );

        const Input = ({ label, type = 'text', placeholder, value, onChange, className = '', required, icon: Icon, error, ...props }) => (
            <div className={className}>
                {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>}
                <div className="relative">
                    {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon size={18} /></div>}
                    <input
                        type={type}
                        value={value}
                        onChange={onChange}
                        placeholder={placeholder}
                        className={'w-full rounded-lg border ' + (error ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : 'border-slate-300 focus:border-medical-500 focus:ring-medical-200') + ' focus:ring-2 focus:ring-opacity-50 outline-none transition-all ' + (Icon ? 'pl-10' : 'pl-4') + ' pr-4 py-2.5 text-sm ' + (error ? 'text-red-900 placeholder-red-300' : 'text-slate-900 placeholder-slate-400')}
                        required={required}
                        {...props}
                    />
                </div>
                {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            </div>
        );

        const Select = ({ label, value, onChange, options, className = '', required }) => (
            <div className={className}>
                {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>}
                <select
                    value={value}
                    onChange={onChange}
                    className="w-full rounded-lg border border-slate-300 focus:border-medical-500 focus:ring-2 focus:ring-medical-200 focus:ring-opacity-50 outline-none transition-all pl-4 pr-8 py-2.5 text-sm text-slate-900 bg-white"
                    required={required}
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>
        );

        const TextArea = ({ label, placeholder, value, onChange, className = '', rows = 3, required }) => (
            <div className={className}>
                {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>}
                <textarea
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    rows={rows}
                    className="w-full rounded-lg border border-slate-300 focus:border-medical-500 focus:ring-2 focus:ring-medical-200 focus:ring-opacity-50 outline-none transition-all px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 resize-vertical"
                    required={required}
                />
            </div>
        );

        const Modal = ({ isOpen, onClose, title, children, size = 'md', footer }) => {
            if (!isOpen) return null;
            const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl', full: 'max-w-full mx-4' };
            return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={onClose}>
                    <div className={'bg-white rounded-2xl shadow-2xl w-full ' + sizes[size] + ' max-h-[90vh] overflow-hidden animate-fade-in'} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                            <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
                                <Icons.X size={20} className="text-slate-500" />
                            </button>
                        </div>
                        <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-8rem)]">{children}</div>
                        {footer && <div className="px-6 py-4 border-t border-slate-100 bg-slate-50">{footer}</div>}
                    </div>
                </div>
            );
        };

        const Tabs = ({ tabs, activeTab, onChange, className = '' }) => (
            <div className={'border-b border-slate-200 ' + className}>
                <div className="flex gap-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => onChange(tab.id)}
                            className={'px-4 py-3 text-sm font-medium transition-colors relative ' + (activeTab === tab.id ? 'text-medical-600 tab-active' : 'text-slate-500 hover:text-slate-700')}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>
        );

        const DataTable = ({ columns, data, onRowClick, actions, emptyMessage = 'No data available', loading = false }) => {
            if (loading) {
                return (
                    <div className="w-full">
                        <div className="animate-pulse space-y-3">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="h-12 bg-slate-100 rounded-lg" />
                            ))}
                        </div>
                    </div>
                );
            }
            if (!data || data.length === 0) {
                return (
                    <div className="text-center py-12">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                            <Icons.FolderOpen size={32} className="text-slate-400" />
                        </div>
                        <p className="text-slate-500">{emptyMessage}</p>
                    </div>
                );
            }
            return (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-200">
                                {columns.map((col) => (
                                    <th key={col.key} className={'px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider ' + (col.className || '')}>
                                        {col.title}
                                    </th>
                                ))}
                                {actions && <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data.map((row, idx) => (
                                <tr
                                    key={idx}
                                    onClick={() => onRowClick && onRowClick(row)}
                                    className={(onRowClick ? 'cursor-pointer hover:bg-slate-50' : '') + ' transition-colors'}
                                >
                                    {columns.map((col) => (
                                        <td key={col.key} className={'px-4 py-3 text-sm text-slate-700 ' + (col.className || '')}>
                                            {col.render ? col.render(row, idx) : row[col.key]}
                                        </td>
                                    ))}
                                    {actions && (
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {actions(row)}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        };

        const StatCard = ({ title, value, subtitle, icon: Icon, trend, trendValue, color = 'medical' }) => {
            const colorClasses = {
                medical: 'bg-medical-50 text-medical-600 border-medical-100',
                emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
                amber: 'bg-amber-50 text-amber-600 border-amber-100',
                red: 'bg-red-50 text-red-600 border-red-100',
                violet: 'bg-violet-50 text-violet-600 border-violet-100',
                teal: 'bg-teal-50 text-teal-600 border-teal-100'
            };
            return (
                <Card className="hover-lift">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <p className="text-sm font-medium text-slate-500">{title}</p>
                            <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
                            {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
                            {trend && (
                                <div className={'flex items-center gap-1 mt-2 text-xs font-medium ' + (trend === 'up' ? 'text-emerald-600' : 'text-red-600')}>
                                    {trend === 'up' ? <Icons.TrendingUp size={14} /> : <Icons.TrendingUp size={14} className="rotate-180" />}
                                    {trendValue}
                                </div>
                            )}
                        </div>
                        <div className={'p-3 rounded-xl border ' + colorClasses[color]}>
                            <Icon size={24} />
                        </div>
                    </div>
                </Card>
            );
        };

        const ProgressBar = ({ value, max = 100, color = 'medical', size = 'md', label }) => {
            const percentage = Math.min(100, Math.max(0, (value / max) * 100));
            const colors = {
                medical: 'bg-medical-500',
                emerald: 'bg-emerald-500',
                amber: 'bg-amber-500',
                red: 'bg-red-500',
                violet: 'bg-violet-500'
            };
            const heights = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' };
            return (
                <div>
                    {label && <div className="flex justify-between text-xs mb-1"><span className="text-slate-600">{label}</span><span className="text-slate-900 font-medium">{Math.round(percentage)}%</span></div>}
                    <div className={'w-full bg-slate-100 rounded-full ' + heights[size]}>
                        <div className={colors[color] + ' rounded-full ' + heights[size] + ' transition-all duration-500'} style={{ width: percentage + '%' }} />
                    </div>
                </div>
            );
        };

        const Avatar = ({ name, size = 'md', className = '' }) => {
            const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-base', xl: 'w-20 h-20 text-lg' };
            const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
            const colors = ['bg-medical-100 text-medical-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'];
            const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;
            return (
                <div className={sizes[size] + ' ' + colors[colorIndex] + ' rounded-full flex items-center justify-center font-semibold ' + className}>
                    {initials}
                </div>
            );
        };

        const SearchBar = ({ value, onChange, placeholder = 'Search...', className = '' }) => (
            <div className={'relative ' + className}>
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Icons.Search size={18} />
                </div>
                <input
                    type="text"
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:border-medical-500 focus:ring-2 focus:ring-medical-200 focus:ring-opacity-50 outline-none transition-all text-sm"
                />
                {value && (
                    <button onClick={() => onChange({ target: { value: '' } })} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <Icons.X size={16} />
                    </button>
                )}
            </div>
        );

        const Toast = ({ message, type = 'info', onClose }) => {
            useEffect(() => {
                const timer = setTimeout(onClose, 4000);
                return () => clearTimeout(timer);
            }, [onClose]);
            const colors = {
                info: 'bg-medical-600',
                success: 'bg-emerald-600',
                warning: 'bg-amber-500',
                error: 'bg-red-600'
            };
            return (
                <div className={'fixed bottom-4 right-4 ' + colors[type] + ' text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 toast z-50'}>
                    {type === 'success' && <Icons.CheckCircle size={20} />}
                    {type === 'error' && <Icons.AlertCircle size={20} />}
                    <span className="text-sm font-medium">{message}</span>
                    <button onClick={onClose} className="ml-2 hover:opacity-80"><Icons.X size={16} /></button>
                </div>
            );
        };

        // ==========================================
        // CHART COMPONENTS
        // ==========================================
        const LineChart = ({ data, width = 400, height = 200, color = '#2563eb' }) => {
            if (!data || data.length === 0) return null;
            const padding = 20;
            const chartWidth = width - padding * 2;
            const chartHeight = height - padding * 2;
            const maxValue = Math.max(...data.map(d => d.value));
            const minValue = Math.min(...data.map(d => d.value));
            const range = maxValue - minValue || 1;
            
            const points = data.map((d, i) => {
                const x = padding + (i / (data.length - 1)) * chartWidth;
                const y = padding + chartHeight - ((d.value - minValue) / range) * chartHeight;
                return x + ',' + y;
            }).join(' ');

            const areaPoints = padding + ',' + height + ' ' + points + ' ' + (width - padding) + ',' + height;

            return (
                <svg width={width} height={height} className="overflow-visible">
                    <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                            <stop offset="100%" stopColor={color} stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <polygon points={areaPoints} fill="url(#areaGradient)" />
                    <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="vitals-graph" />
                    {data.map((d, i) => {
                        const x = padding + (i / (data.length - 1)) * chartWidth;
                        const y = padding + chartHeight - ((d.value - minValue) / range) * chartHeight;
                        return <circle key={i} cx={x} cy={y} r="4" fill="white" stroke={color} strokeWidth="2" />;
                    })}
                </svg>
            );
        };

        const BarChart = ({ data, width = 400, height = 200, color = '#2563eb' }) => {
            if (!data || data.length === 0) return null;
            const padding = 30;
            const barWidth = (width - padding * 2) / data.length - 8;
            const maxValue = Math.max(...data.map(d => d.value));
            
            return (
                <svg width={width} height={height} className="overflow-visible">
                    {data.map((d, i) => {
                        const barHeight = (d.value / maxValue) * (height - padding * 2);
                        const x = padding + i * (barWidth + 8) + 4;
                        const y = height - padding - barHeight;
                        return (
                            <g key={i}>
                                <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} rx="4" className="chart-bar" opacity="0.8" />
                                <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" className="text-xs fill-slate-500" style={{ fontSize: '10px' }}>{d.label}</text>
                            </g>
                        );
                    })}
                </svg>
            );
        };

        const DonutChart = ({ value, max = 100, size = 120, strokeWidth = 10, color = '#2563eb', label }) => {
            const radius = (size - strokeWidth) / 2;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (value / max) * circumference;
            
            return (
                <div className="relative inline-flex items-center justify-center">
                    <svg width={size} height={size} className="progress-ring">
                        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
                        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="progress-ring-circle" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-bold text-slate-900">{Math.round((value / max) * 100)}%</span>
                        {label && <span className="text-xs text-slate-500">{label}</span>}
                    </div>
                </div>
            );
        };

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
                    if (!found) {
                        const sourceUsers = hydrateSeedData().users || [];
                        found = sourceUsers.find(u => u.email === email && u.password === password) || null;
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
                    setError('Invalid email or password. Try: admin@medicore.com / admin123');
                }
            };

            const demoAccounts = [
                { role: 'Super Admin', email: 'admin@medicore.com', pass: 'admin123' },
                { role: 'Doctor', email: 'dr.smith@medicore.com', pass: 'doctor123' },
                { role: 'Nurse', email: 'nurse.wilson@medicore.com', pass: 'nurse123' },
                { role: 'Receptionist', email: 'reception@medicore.com', pass: 'recept123' },
                { role: 'Lab Scientist', email: 'lab.tech@medicore.com', pass: 'lab123' },
                { role: 'Pharmacist', email: 'pharmacy@medicore.com', pass: 'pharma123' },
                { role: 'Patient', email: 'patient@demo.com', pass: 'patient123' }
            ];

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
                                    label="Email"
                                    type="email"
                                    placeholder="Enter your email"
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

                        <div className="mt-6">
                            <p className="text-xs text-slate-500 text-center mb-3">Demo Accounts (click to auto-fill)</p>
                            <div className="grid grid-cols-2 gap-2">
                                {demoAccounts.map((acc) => (
                                    <button
                                        key={acc.email}
                                        onClick={() => { setEmail(acc.email); setPassword(acc.pass); }}
                                        className="text-left px-3 py-2 rounded-lg bg-white border border-slate-200 hover:border-medical-300 hover:bg-medical-50 transition-all text-xs"
                                    >
                                        <span className="font-medium text-slate-700 block">{acc.role}</span>
                                        <span className="text-slate-400">{acc.email}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        // ==========================================
        // SIDEBAR NAVIGATION
        // ==========================================
        const Sidebar = ({ activeModule, onModuleChange, collapsed, onToggle }) => {
            const { user, logout } = useAuth();
            
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
                        { id: 'inventory', label: 'Inventory', icon: Icons.Package },
                        { id: 'hr', label: 'HR & Staff', icon: Icons.UserCog },
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
                    ],
                    nurse: [
                        { id: 'patients', label: 'Patients', icon: Icons.Users },
                        { id: 'ward', label: 'Ward Management', icon: Icons.Bed },
                        { id: 'vitals', label: 'Vital Signs', icon: Icons.Activity },
                        { id: 'medications', label: 'Medications', icon: Icons.Syringe },
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
                return [...common, ...(roleMenus[user?.role] || [])];
            };

            const menuItems = getMenuItems();

            return (
                <div className={(collapsed ? 'w-16' : 'w-64') + ' bg-white border-r border-slate-200 flex flex-col transition-all duration-300 h-screen sticky top-0 z-40'}>
                    <div className="h-16 flex items-center px-4 border-b border-slate-100">
                        <div className={'flex items-center gap-3 ' + (collapsed ? 'justify-center w-full' : '')}>
                            <div className="w-10 h-10 rounded-xl bg-medical-600 flex items-center justify-center text-white flex-shrink-0">
                                <Icons.HeartPulse size={22} />
                            </div>
                            {!collapsed && (
                                <div>
                                    <h1 className="font-bold text-slate-900 text-lg leading-tight">MediCore</h1>
                                    <p className="text-xs text-slate-400">EMR System</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto sidebar-scroll py-4 px-3 space-y-1">
                        {menuItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => onModuleChange(item.id)}
                                className={'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ' + (activeModule === item.id ? 'bg-medical-50 text-medical-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900') + ' ' + (collapsed ? 'justify-center' : '')}
                                title={collapsed ? item.label : ''}
                            >
                                <item.icon size={20} className={activeModule === item.id ? 'text-medical-600' : 'text-slate-400'} />
                                {!collapsed && <span>{item.label}</span>}
                            </button>
                        ))}
                    </div>

                    <div className="p-4 border-t border-slate-100">
                        <button
                            onClick={onToggle}
                            className={'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-50 transition-all ' + (collapsed ? 'justify-center' : '')}
                        >
                            {collapsed ? <Icons.PanelLeft size={18} /> : <><Icons.PanelLeft size={18} className="rotate-180" /> <span>Collapse</span></>}
                        </button>
                        <button
                            onClick={logout}
                            className={'w-full flex items-center gap-3 px-3 py-2 mt-1 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-all ' + (collapsed ? 'justify-center' : '')}
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
        const Header = ({ onSearch, notifications, onNotificationClick }) => {
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
                <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 px-6 flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                        <div className="w-96">
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
                                className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <Icons.Bell size={20} className="text-slate-600" />
                                {unreadCount > 0 && (
                                    <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center notification-badge">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                            {showNotifications && (
                                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 py-2 dropdown-menu z-50">
                                    <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                                        <span className="font-semibold text-sm">Notifications</span>
                                        <button className="text-xs text-medical-600 hover:underline">Mark all read</button>
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
                                        <button className="text-sm text-medical-600 hover:underline">View all notifications</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="relative">
                            <button
                                onClick={() => setShowProfile(!showProfile)}
                                className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <Avatar name={user?.name} size="sm" />
                                <div className="hidden md:block text-left">
                                    <p className="text-sm font-medium text-slate-900 leading-tight">{user?.name}</p>
                                    <p className="text-xs text-slate-500 capitalize">{user?.role?.replace('_', ' ')}</p>
                                </div>
                                <Icons.ChevronDown size={16} className="text-slate-400" />
                            </button>
                            {showProfile && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 dropdown-menu z-50">
                                    <div className="px-4 py-3 border-b border-slate-100">
                                        <p className="font-medium text-sm text-slate-900">{user?.name}</p>
                                        <p className="text-xs text-slate-500">{user?.email}</p>
                                    </div>
                                    <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                        <Icons.User size={16} /> Profile
                                    </button>
                                    <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                        <Icons.Settings size={16} /> Settings
                                    </button>
                                    <div className="border-t border-slate-100 mt-1 pt-1">
                                        <button onClick={() => {}} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
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

        // ==========================================
        // DASHBOARD MODULE
        // ==========================================
        const DashboardModule = () => {
            const { user } = useAuth();
            const [timeRange, setTimeRange] = useState('today');
            
            const stats = useMemo(() => {
                const today = new Date('2026-09-01');
                return {
                    totalPatients: seedData.patients.length,
                    todayAppointments: seedData.appointments.filter(a => a.date === '2026-09-01').length,
                    pendingLabs: seedData.labOrders.filter(l => l.status === 'pending').length,
                    occupiedBeds: seedData.admissions.filter(a => a.status === 'active').length,
                    totalRevenue: seedData.billing.reduce((sum, b) => sum + parseFloat(b.paid), 0).toFixed(2),
                    criticalPatients: seedData.admissions.filter(a => a.acuity === 'critical').length,
                    pendingBills: seedData.billing.filter(b => b.status === 'pending' || b.status === 'partial').length,
                    staffOnline: seedData.users.filter(u => u.status === 'active').length
                };
            }, []);

            const recentActivity = seedData.auditLogs.slice(0, 10);

            const appointmentData = [
                { label: 'Mon', value: 12 },
                { label: 'Tue', value: 19 },
                { label: 'Wed', value: 15 },
                { label: 'Thu', value: 22 },
                { label: 'Fri', value: 18 },
                { label: 'Sat', value: 8 },
                { label: 'Sun', value: 5 },
            ];

            const revenueData = [
                { label: 'W1', value: 45000 },
                { label: 'W2', value: 52000 },
                { label: 'W3', value: 48000 },
                { label: 'W4', value: 61000 },
            ];

            const getRoleDashboard = () => {
                switch (user?.role) {
                    case 'doctor':
                        return (
                            <div className="space-y-6 animate-fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <StatCard title="Today's Appointments" value={stats.todayAppointments} icon={Icons.Calendar} color="medical" trend="up" trendValue="+3 from yesterday" />
                                    <StatCard title="Patients Waiting" value={8} icon={Icons.Users} color="amber" />
                                    <StatCard title="Pending Labs" value={stats.pendingLabs} icon={Icons.FlaskConical} color="violet" />
                                    <StatCard title="Prescriptions" value={12} icon={Icons.Pill} color="emerald" />
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <Card title="Today's Schedule" className="lg:col-span-2" action={<Button variant="ghost" size="sm" icon={Icons.Calendar}>View All</Button>}>
                                        <div className="space-y-3">
                                            {seedData.appointments.filter(a => a.date === '2026-09-01').slice(0, 5).map((apt) => {
                                                const patient = seedData.patients.find(p => p.id === apt.patientId);
                                                return (
                                                    <div key={apt.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                                                        <div className="text-center min-w-[60px]">
                                                            <p className="text-lg font-bold text-medical-600">{apt.time}</p>
                                                            <p className="text-xs text-slate-400">{apt.type}</p>
                                                        </div>
                                                        <Avatar name={patient?.firstName + ' ' + patient?.lastName} size="sm" />
                                                        <div className="flex-1">
                                                            <p className="font-medium text-slate-900">{patient?.firstName} {patient?.lastName}</p>
                                                            <p className="text-xs text-slate-500">{apt.department} - {apt.status}</p>
                                                        </div>
                                                        <Badge variant={apt.status === 'in-progress' ? 'info' : apt.status === 'completed' ? 'success' : 'default'}>{apt.status}</Badge>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </Card>
                                    <Card title="Quick Actions">
                                        <div className="space-y-2">
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.UserPlus}>New Consultation</Button>
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.FlaskConical}>Order Lab Test</Button>
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.Image}>Order Imaging</Button>
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.Pill}>Write Prescription</Button>
                                            <Button variant="secondary" className="w-full justify-start" icon={Icons.MessageSquare}>Message Patient</Button>
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        );
                    case 'nurse':
                        return (
                            <div className="space-y-6 animate-fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <StatCard title="Ward Occupancy" value={stats.occupiedBeds + '/132'} icon={Icons.Bed} color="medical" />
                                    <StatCard title="Vitals Due" value={15} icon={Icons.Activity} color="amber" />
                                    <StatCard title="Medications Due" value={23} icon={Icons.Syringe} color="emerald" />
                                    <StatCard title="Critical Patients" value={stats.criticalPatients} icon={Icons.AlertCircle} color="red" />
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <Card title="Bed Status" subtitle="Real-time ward occupancy">
                                        <div className="grid grid-cols-2 gap-4">
                                            {seedData.wards.map(ward => (
                                                <div key={ward.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-medium text-slate-700">{ward.name}</span>
                                                        <Badge variant={ward.occupied >= ward.capacity * 0.9 ? 'danger' : 'success'}>{ward.occupied}/{ward.capacity}</Badge>
                                                    </div>
                                                    <ProgressBar value={ward.occupied} max={ward.capacity} color={ward.occupied >= ward.capacity * 0.9 ? 'red' : 'medical'} size="sm" />
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                    <Card title="Vital Signs Alerts">
                                        <div className="space-y-3">
                                            {[1, 2, 3].map((i) => (
                                                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                                                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                                                        <Icons.AlertCircle size={20} className="text-red-600" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-slate-900">Room {100 + i} - Critical BP</p>
                                                        <p className="text-xs text-slate-500">Patient: John Doe - BP: 180/110</p>
                                                    </div>
                                                    <Button variant="danger" size="sm">Respond</Button>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        );
                    default:
                        return (
                            <div className="space-y-6 animate-fade-in">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-2xl font-bold text-slate-900">Dashboard Overview</h2>
                                    <div className="flex gap-2">
                                        {['today', 'week', 'month', 'year'].map((range) => (
                                            <button
                                                key={range}
                                                onClick={() => setTimeRange(range)}
                                                className={'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ' + (timeRange === range ? 'bg-medical-100 text-medical-700' : 'text-slate-600 hover:bg-slate-100')}
                                            >
                                                {range.charAt(0).toUpperCase() + range.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <StatCard title="Total Patients" value={stats.totalPatients} subtitle="Registered patients" icon={Icons.Users} color="medical" trend="up" trendValue="+12% this month" />
                                    <StatCard title="Today's Appointments" value={stats.todayAppointments} subtitle="Scheduled visits" icon={Icons.Calendar} color="emerald" />
                                    <StatCard title="Occupied Beds" value={stats.occupiedBeds + '/132'} subtitle="Current occupancy" icon={Icons.Bed} color="amber" />
                                    <StatCard title="Revenue" value={formatCurrency(stats.totalRevenue)} subtitle="Total collected" icon={Icons.DollarSign} color="teal" trend="up" trendValue="+8.5% this month" />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <Card title="Appointment Trends" className="lg:col-span-2">
                                        <BarChart data={appointmentData} width={600} height={200} color="#2563eb" />
                                    </Card>
                                    <Card title="Department Distribution">
                                        <div className="space-y-4">
                                            {[
                                                { name: 'Cardiology', value: 28, color: 'bg-medical-500' },
                                                { name: 'Orthopedics', value: 22, color: 'bg-emerald-500' },
                                                { name: 'General Medicine', value: 35, color: 'bg-violet-500' },
                                                { name: 'Pediatrics', value: 15, color: 'bg-amber-500' },
                                            ].map((dept) => (
                                                <div key={dept.name}>
                                                    <div className="flex justify-between text-sm mb-1">
                                                        <span className="text-slate-700">{dept.name}</span>
                                                        <span className="font-medium text-slate-900">{dept.value}%</span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                                        <div className={dept.color + ' h-2 rounded-full transition-all'} style={{ width: dept.value + '%' }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <Card title="Revenue Overview">
                                        <LineChart data={revenueData} width={600} height={200} color="#059669" />
                                    </Card>
                                    <Card title="Recent Activity" action={<Button variant="ghost" size="sm">View All</Button>}>
                                        <div className="space-y-3">
                                            {recentActivity.map((log) => (
                                                <div key={log.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                                                    <div className={'w-2 h-2 rounded-full mt-2 flex-shrink-0 ' + (log.severity === 'critical' ? 'bg-red-500' : log.severity === 'warning' ? 'bg-amber-500' : 'bg-medical-500')} />
                                                    <div className="flex-1">
                                                        <p className="text-sm text-slate-900">
                                                            <span className="font-medium">{log.action}</span>
                                                            {' '}{log.entityType}
                                                        </p>
                                                        <p className="text-xs text-slate-500">{formatDateTime(log.timestamp)} - {log.ipAddress}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <Card title="Bed Occupancy by Ward">
                                        <div className="space-y-4">
                                            {seedData.wards.map(ward => (
                                                <div key={ward.id} className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-medium text-slate-900">{ward.name}</p>
                                                        <p className="text-xs text-slate-500">{ward.occupied} of {ward.capacity} beds</p>
                                                    </div>
                                                    <DonutChart value={ward.occupied} max={ward.capacity} size={60} strokeWidth={8} color={ward.occupied / ward.capacity > 0.9 ? '#ef4444' : '#2563eb'} />
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                    <Card title="Lab Workload" className="lg:col-span-2">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {[
                                                { label: 'Pending', value: seedData.labOrders.filter(l => l.status === 'pending').length, color: 'text-amber-600 bg-amber-50' },
                                                { label: 'Processing', value: seedData.labOrders.filter(l => l.status === 'processing').length, color: 'text-medical-600 bg-medical-50' },
                                                { label: 'Completed', value: seedData.labOrders.filter(l => l.status === 'completed').length, color: 'text-emerald-600 bg-emerald-50' },
                                                { label: 'Critical', value: seedData.labOrders.filter(l => l.status === 'critical').length, color: 'text-red-600 bg-red-50' },
                                            ].map(item => (
                                                <div key={item.label} className={'p-4 rounded-xl ' + item.color + ' text-center'}>
                                                    <p className="text-2xl font-bold">{item.value}</p>
                                                    <p className="text-xs font-medium mt-1">{item.label}</p>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-4">
                                            <DataTable
                                                columns={[
                                                    { key: 'testType', title: 'Test' },
                                                    { key: 'category', title: 'Category' },
                                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'critical' ? 'danger' : row.status === 'completed' ? 'success' : 'warning'}>{row.status}</Badge> },
                                                    { key: 'priority', title: 'Priority', render: (row) => <Badge variant={row.priority === 'stat' ? 'danger' : row.priority === 'urgent' ? 'warning' : 'default'}>{row.priority}</Badge> }
                                                ]}
                                                data={seedData.labOrders.slice(0, 5)}
                                            />
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        );
                }
            };

            return (
                <div className="p-6">
                    {getRoleDashboard()}
                </div>
            );
        };

        // ==========================================
        // PATIENTS MODULE
        // ==========================================
        const PatientsModule = () => {
            const [searchQuery, setSearchQuery] = useState('');
            const [selectedPatient, setSelectedPatient] = useState(null);
            const [showRegistration, setShowRegistration] = useState(false);
            const [activeTab, setActiveTab] = useState('overview');
            const [filterStatus, setFilterStatus] = useState('all');
            const [patients, setPatients] = useState((hydrateSeedData().patients || []));
            const [form, setForm] = useState({
                firstName: '',
                lastName: '',
                dateOfBirth: '',
                gender: '',
                phone: '',
                email: '',
                address: '',
                bloodGroup: '',
                emergencyContactName: '',
                emergencyContactPhone: ''
            });

            const filteredPatients = useMemo(() => {
                let filtered = patients || [];
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    filtered = filtered.filter(p => 
                        (p.firstName || '').toLowerCase().includes(q) ||
                        (p.lastName || '').toLowerCase().includes(q) ||
                        (p.patientNumber || '').toLowerCase().includes(q) ||
                        (p.phone || '').includes(q)
                    );
                }
                if (filterStatus !== 'all') {
                    filtered = filtered.filter(p => p.status === filterStatus);
                }
                return filtered;
            }, [patients, searchQuery, filterStatus]);

            const handleRegisterPatient = async () => {
                const payload = {
                    patient_number: `P-${new Date().getFullYear()}-${String((patients?.length || 0) + 1).padStart(4, '0')}`,
                    first_name: form.firstName,
                    last_name: form.lastName,
                    date_of_birth: form.dateOfBirth,
                    gender: form.gender,
                    phone: form.phone,
                    email: form.email || `${form.firstName.toLowerCase()}.${form.lastName.toLowerCase()}@medicore.local`,
                    address: form.address,
                    blood_group: form.bloodGroup,
                    emergency_contact_name: form.emergencyContactName,
                    emergency_contact_phone: form.emergencyContactPhone,
                    registration_date: new Date().toISOString().split('T')[0],
                    status: 'active',
                    allergies: 'None',
                    chronic_conditions: 'None'
                };

                if (!payload.first_name || !payload.last_name || !payload.date_of_birth || !payload.phone) {
                    return;
                }

                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                let created = null;
                if (client) {
                    const { data, error } = await client.from('patients').insert([payload]).select();
                    if (!error && data && data[0]) created = data[0];
                }
                if (!created) {
                    const id = 'p' + Date.now();
                    created = { ...payload, id, patientNumber: payload.patient_number, firstName: payload.first_name, lastName: payload.last_name, dateOfBirth: payload.date_of_birth, bloodGroup: payload.blood_group, emergencyContact: { name: payload.emergency_contact_name, phone: payload.emergency_contact_phone }, insurance: { provider: 'Not Provided', policyNumber: 'N/A' }, createdAt: new Date().toISOString() };
                    persistSeedTable('patients', [...patients, created]);
                    setPatients([...patients, created]);
                } else {
                    const mapped = {
                        ...created,
                        id: created.id,
                        patientNumber: created.patient_number || created.patientNumber,
                        firstName: created.first_name || created.firstName,
                        lastName: created.last_name || created.lastName,
                        dateOfBirth: created.date_of_birth || created.dateOfBirth,
                        bloodGroup: created.blood_group || created.bloodGroup,
                        emergencyContact: { name: created.emergency_contact_name || '', phone: created.emergency_contact_phone || '' },
                        insurance: { provider: created.insurance_provider || 'Not Provided', policyNumber: created.insurance_policy_number || 'N/A' },
                        registrationDate: created.registration_date || created.registrationDate || new Date().toISOString().split('T')[0]
                    };
                    const nextPatients = [...patients, mapped];
                    persistSeedTable('patients', nextPatients);
                    setPatients(nextPatients);
                }
                setForm({ firstName: '', lastName: '', dateOfBirth: '', gender: '', phone: '', email: '', address: '', bloodGroup: '', emergencyContactName: '', emergencyContactPhone: '' });
                setShowRegistration(false);
            };

            const handlePatientClick = (patient) => {
                setSelectedPatient(patient);
                setActiveTab('overview');
            };

            const PatientDetailView = ({ patient }) => {
                const patientAppointments = seedData.appointments.filter(a => a.patientId === patient.id);
                const patientLabs = seedData.labOrders.filter(l => l.patientId === patient.id);
                const patientPrescriptions = seedData.prescriptions.filter(p => p.patientId === patient.id);
                const patientVitals = seedData.vitals.filter(v => v.patientId === patient.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                const patientBilling = seedData.billing.filter(b => b.patientId === patient.id);
                const patientAdmissions = seedData.admissions.filter(a => a.patientId === patient.id);

                const tabs = [
                    { id: 'overview', label: 'Overview' },
                    { id: 'visits', label: 'Visits & Appointments' },
                    { id: 'labs', label: 'Lab Results' },
                    { id: 'prescriptions', label: 'Prescriptions' },
                    { id: 'vitals', label: 'Vital Signs' },
                    { id: 'billing', label: 'Billing' },
                    { id: 'admissions', label: 'Admissions' },
                    { id: 'documents', label: 'Documents' },
                ];

                return (
                    <div className="animate-fade-in">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <Avatar name={patient.firstName + ' ' + patient.lastName} size="xl" />
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900">{patient.firstName} {patient.lastName}</h2>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-sm text-slate-500">{patient.patientNumber}</span>
                                        <Badge variant={patient.status === 'active' ? 'success' : 'default'}>{patient.status}</Badge>
                                        <span className="text-sm text-slate-500">{calculateAge(patient.dateOfBirth)} years - {patient.gender}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="secondary" icon={Icons.Printer}>Print</Button>
                                <Button variant="primary" icon={Icons.Edit}>Edit</Button>
                            </div>
                        </div>

                        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                        <div className="mt-6">
                            {activeTab === 'overview' && (
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <div className="lg:col-span-2 space-y-6">
                                        <Card title="Patient Information">
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Date of Birth</p>
                                                    <p className="text-sm font-medium text-slate-900">{formatDate(patient.dateOfBirth)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Blood Group</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.bloodGroup}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Phone</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.phone}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Email</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.email}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Address</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.address}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Registration Date</p>
                                                    <p className="text-sm font-medium text-slate-900">{formatDate(patient.registrationDate)}</p>
                                                </div>
                                            </div>
                                        </Card>

                                        <Card title="Medical Alerts">
                                            <div className="space-y-3">
                                                {patient.allergies !== 'None' && (
                                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                                                        <Icons.AlertCircle size={20} className="text-red-600 flex-shrink-0" />
                                                        <div>
                                                            <p className="text-sm font-medium text-red-800">Allergy Alert</p>
                                                            <p className="text-sm text-red-700">{patient.allergies}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                {patient.chronicConditions !== 'None' && (
                                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
                                                        <Icons.AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
                                                        <div>
                                                            <p className="text-sm font-medium text-amber-800">Chronic Conditions</p>
                                                            <p className="text-sm text-amber-700">{patient.chronicConditions}</p>
                                                        </div>
                                                    </div>
                                                )}
                                                {patient.allergies === 'None' && patient.chronicConditions === 'None' && (
                                                    <p className="text-slate-500 text-center py-4">No active alerts</p>
                                                )}
                                            </div>
                                        </Card>

                                        <Card title="Recent Visits">
                                            <DataTable
                                                columns={[
                                                    { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                                    { key: 'type', title: 'Type' },
                                                    { key: 'department', title: 'Department' },
                                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'in-progress' ? 'info' : 'default'}>{row.status}</Badge> }
                                                ]}
                                                data={patientAppointments.slice(0, 5)}
                                            />
                                        </Card>
                                    </div>

                                    <div className="space-y-6">
                                        <Card title="Insurance Information">
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Provider</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.insurance.provider}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Policy Number</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.insurance.policyNumber}</p>
                                                </div>
                                            </div>
                                        </Card>

                                        <Card title="Emergency Contact">
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Name</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.emergencyContact.name}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">Phone</p>
                                                    <p className="text-sm font-medium text-slate-900">{patient.emergencyContact.phone}</p>
                                                </div>
                                            </div>
                                        </Card>

                                        <Card title="Quick Stats">
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-slate-600">Total Visits</span>
                                                    <span className="font-medium text-slate-900">{patientAppointments.length}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-slate-600">Lab Tests</span>
                                                    <span className="font-medium text-slate-900">{patientLabs.length}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-slate-600">Prescriptions</span>
                                                    <span className="font-medium text-slate-900">{patientPrescriptions.length}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-slate-600">Admissions</span>
                                                    <span className="font-medium text-slate-900">{patientAdmissions.length}</span>
                                                </div>
                                            </div>
                                        </Card>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'vitals' && (
                                <Card title="Vital Signs History">
                                    {patientVitals.length > 0 ? (
                                        <div className="space-y-6">
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                {[
                                                    { label: 'Latest BP', value: patientVitals[0].bloodPressureSystolic + '/' + patientVitals[0].bloodPressureDiastolic, unit: 'mmHg' },
                                                    { label: 'Heart Rate', value: patientVitals[0].heartRate, unit: 'bpm' },
                                                    { label: 'Temperature', value: patientVitals[0].temperature, unit: 'C' },
                                                    { label: 'O2 Saturation', value: patientVitals[0].oxygenSaturation, unit: '%' },
                                                ].map(v => (
                                                    <div key={v.label} className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center">
                                                        <p className="text-xs text-slate-500 mb-1">{v.label}</p>
                                                        <p className="text-xl font-bold text-slate-900">{v.value}</p>
                                                        <p className="text-xs text-slate-400">{v.unit}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="h-64">
                                                <LineChart 
                                                    data={patientVitals.slice(0, 10).reverse().map((v, i) => ({ value: v.heartRate, label: i }))} 
                                                    width={800} 
                                                    height={250} 
                                                    color="#ef4444" 
                                                />
                                            </div>
                                            <DataTable
                                                columns={[
                                                    { key: 'timestamp', title: 'Date/Time', render: (row) => formatDateTime(row.timestamp) },
                                                    { key: 'temperature', title: 'Temp (C)' },
                                                    { key: 'heartRate', title: 'HR (bpm)' },
                                                    { key: 'bloodPressure', title: 'BP', render: (row) => row.bloodPressureSystolic + '/' + row.bloodPressureDiastolic },
                                                    { key: 'oxygenSaturation', title: 'SpO2 (%)' },
                                                    { key: 'painScore', title: 'Pain' }
                                                ]}
                                                data={patientVitals.slice(0, 20)}
                                            />
                                        </div>
                                    ) : (
                                        <p className="text-center py-8 text-slate-500">No vital signs recorded</p>
                                    )}
                                </Card>
                            )}

                            {activeTab === 'labs' && (
                                <Card title="Laboratory Results">
                                    <DataTable
                                        columns={[
                                            { key: 'testType', title: 'Test' },
                                            { key: 'category', title: 'Category' },
                                            { key: 'orderedDate', title: 'Ordered', render: (row) => formatDate(row.orderedDate) },
                                            { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'critical' ? 'danger' : row.status === 'completed' ? 'success' : 'warning'}>{row.status}</Badge> },
                                            { key: 'priority', title: 'Priority', render: (row) => <Badge variant={row.priority === 'stat' ? 'danger' : row.priority === 'urgent' ? 'warning' : 'default'}>{row.priority}</Badge> }
                                        ]}
                                        data={patientLabs}
                                        actions={(row) => (
                                            <Button variant="ghost" size="sm" icon={Icons.Eye}>View</Button>
                                        )}
                                    />
                                </Card>
                            )}

                            {activeTab === 'prescriptions' && (
                                <Card title="Prescription History">
                                    <DataTable
                                        columns={[
                                            { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                            { key: 'diagnosis', title: 'Diagnosis' },
                                            { key: 'medications', title: 'Medications', render: (row) => row.medications.map(m => m.name).join(', ') },
                                            { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : row.status === 'dispensed' ? 'info' : 'default'}>{row.status}</Badge> }
                                        ]}
                                        data={patientPrescriptions}
                                    />
                                </Card>
                            )}

                            {activeTab === 'billing' && (
                                <Card title="Billing History">
                                    <DataTable
                                        columns={[
                                            { key: 'invoiceNumber', title: 'Invoice' },
                                            { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                            { key: 'total', title: 'Total', render: (row) => formatCurrency(row.total) },
                                            { key: 'paid', title: 'Paid', render: (row) => formatCurrency(row.paid) },
                                            { key: 'balance', title: 'Balance', render: (row) => formatCurrency(row.balance) },
                                            { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'paid' ? 'success' : row.status === 'partial' ? 'warning' : row.status === 'overdue' ? 'danger' : 'default'}>{row.status}</Badge> }
                                        ]}
                                        data={patientBilling}
                                    />
                                </Card>
                            )}

                            {activeTab === 'admissions' && (
                                <Card title="Admission History">
                                    <DataTable
                                        columns={[
                                            { key: 'ward', title: 'Ward' },
                                            { key: 'bedNumber', title: 'Bed' },
                                            { key: 'admissionDate', title: 'Admitted', render: (row) => formatDate(row.admissionDate) },
                                            { key: 'dischargeDate', title: 'Discharged', render: (row) => row.dischargeDate ? formatDate(row.dischargeDate) : 'Still admitted' },
                                            { key: 'diagnosis', title: 'Diagnosis' },
                                            { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'info' : 'default'}>{row.status}</Badge> }
                                        ]}
                                        data={patientAdmissions}
                                    />
                                </Card>
                            )}

                            {activeTab === 'visits' && (
                                <Card title="Appointments & Visits">
                                    <DataTable
                                        columns={[
                                            { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                            { key: 'time', title: 'Time' },
                                            { key: 'type', title: 'Type' },
                                            { key: 'department', title: 'Department' },
                                            { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'in-progress' ? 'info' : row.status === 'cancelled' ? 'danger' : 'default'}>{row.status}</Badge> }
                                        ]}
                                        data={patientAppointments}
                                    />
                                </Card>
                            )}

                            {activeTab === 'documents' && (
                                <Card title="Patient Documents">
                                    <div className="text-center py-8">
                                        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 mb-4">
                                            <Icons.Upload size={40} className="mx-auto text-slate-400 mb-3" />
                                            <p className="text-sm text-slate-600 font-medium">Drag and drop files here</p>
                                            <p className="text-xs text-slate-400 mt-1">or click to browse</p>
                                        </div>
                                        <p className="text-slate-500">No documents uploaded yet</p>
                                    </div>
                                </Card>
                            )}
                        </div>
                    </div>
                );
            };

            return (
                <div className="p-6">
                    {selectedPatient ? (
                        <div>
                            <button
                                onClick={() => setSelectedPatient(null)}
                                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-4"
                            >
                                <Icons.ArrowLeft size={16} /> Back to patients list
                            </button>
                            <PatientDetailView patient={selectedPatient} />
                        </div>
                    ) : (
                        <div className="space-y-6 animate-fade-in">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900">Patients</h2>
                                    <p className="text-slate-500 mt-1">Manage patient records and registrations</p>
                                </div>
                                <Button variant="primary" icon={Icons.UserPlus} onClick={() => setShowRegistration(true)}>Register Patient</Button>
                            </div>

                            <Card>
                                <div className="flex flex-col md:flex-row gap-4 mb-6">
                                    <div className="flex-1">
                                        <SearchBar
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search by name, ID, or phone..."
                                        />
                                    </div>
                                    <Select
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        options={[
                                            { value: 'all', label: 'All Status' },
                                            { value: 'active', label: 'Active' },
                                            { value: 'discharged', label: 'Discharged' },
                                            { value: 'inactive', label: 'Inactive' }
                                        ]}
                                        className="w-40"
                                    />
                                </div>

                                <DataTable
                                    columns={[
                                        { key: 'patientNumber', title: 'Patient ID', className: 'font-mono text-xs' },
                                        { key: 'name', title: 'Name', render: (row) => (
                                            <div className="flex items-center gap-3">
                                                <Avatar name={row.firstName + ' ' + row.lastName} size="sm" />
                                                <div>
                                                    <p className="font-medium text-slate-900">{row.firstName} {row.lastName}</p>
                                                    <p className="text-xs text-slate-500">{row.gender} - {calculateAge(row.dateOfBirth)}y</p>
                                                </div>
                                            </div>
                                        )},
                                        { key: 'phone', title: 'Contact' },
                                        { key: 'bloodGroup', title: 'Blood Group' },
                                        { key: 'registrationDate', title: 'Registered', render: (row) => formatDate(row.registrationDate) },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge> }
                                    ]}
                                    data={filteredPatients}
                                    onRowClick={handlePatientClick}
                                    actions={(row) => (
                                        <>
                                            <Button variant="ghost" size="sm" icon={Icons.QrCode}>ID</Button>
                                            <Button variant="ghost" size="sm" icon={Icons.Printer}>Print</Button>
                                        </>
                                    )}
                                />
                            </Card>
                        </div>
                    )}

                    <Modal
                        isOpen={showRegistration}
                        onClose={() => setShowRegistration(false)}
                        title="Register New Patient"
                        size="lg"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowRegistration(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleRegisterPatient}>Register Patient</Button>
                            </div>
                        }
                    >
                        <div className="grid grid-cols-2 gap-4">
                            <Input label="First Name" required value={form.firstName} onChange={(e) => setForm(prev => ({ ...prev, firstName: e.target.value }))} />
                            <Input label="Last Name" required value={form.lastName} onChange={(e) => setForm(prev => ({ ...prev, lastName: e.target.value }))} />
                            <Input label="Date of Birth" type="date" required value={form.dateOfBirth} onChange={(e) => setForm(prev => ({ ...prev, dateOfBirth: e.target.value }))} />
                            <Select label="Gender" required value={form.gender} onChange={(e) => setForm(prev => ({ ...prev, gender: e.target.value }))} options={[{ value: '', label: 'Select...' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} />
                            <Input label="Phone Number" required value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))} />
                            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))} />
                            <Input label="Address" className="col-span-2" value={form.address} onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))} />
                            <Select label="Blood Group" value={form.bloodGroup} onChange={(e) => setForm(prev => ({ ...prev, bloodGroup: e.target.value }))} options={[{ value: '', label: 'Select...' }, { value: 'A+', label: 'A+' }, { value: 'A-', label: 'A-' }, { value: 'B+', label: 'B+' }, { value: 'B-', label: 'B-' }, { value: 'AB+', label: 'AB+' }, { value: 'AB-', label: 'AB-' }, { value: 'O+', label: 'O+' }, { value: 'O-', label: 'O-' }]} />
                            <Input label="Emergency Contact Name" value={form.emergencyContactName} onChange={(e) => setForm(prev => ({ ...prev, emergencyContactName: e.target.value }))} />
                            <Input label="Emergency Contact Phone" value={form.emergencyContactPhone} onChange={(e) => setForm(prev => ({ ...prev, emergencyContactPhone: e.target.value }))} />
                        </div>
                    </Modal>
                </div>
            );
        };

        // ==========================================
        // APPOINTMENTS MODULE
        // ==========================================
        const AppointmentsModule = () => {
            const [view, setView] = useState('list');
            const [selectedDate, setSelectedDate] = useState('2026-09-01');
            const [showNewAppointment, setShowNewAppointment] = useState(false);
            const [appointments, setAppointments] = useState(hydrateSeedData().appointments || []);
            const [appointmentForm, setAppointmentForm] = useState({
                patientId: '',
                doctorId: 'u2',
                date: '2026-09-01',
                time: '09:00',
                type: 'consultation',
                department: 'general',
                notes: ''
            });

            const filteredAppointments = (appointments || []).filter(a => a.date === selectedDate);

            const handleScheduleAppointment = async () => {
                if (!appointmentForm.patientId) return;
                const payload = {
                    id: 'apt_' + Date.now(),
                    patientId: appointmentForm.patientId,
                    doctorId: appointmentForm.doctorId,
                    date: appointmentForm.date,
                    time: appointmentForm.time,
                    type: appointmentForm.type,
                    status: 'scheduled',
                    department: appointmentForm.department,
                    notes: appointmentForm.notes || '',
                    createdAt: new Date().toISOString()
                };
                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                if (client) {
                    const { data, error } = await client.from('appointments').insert([{ ...payload, patient_id: payload.patientId, doctor_id: payload.doctorId, appointment_date: payload.date, appointment_time: payload.time, appointment_type: payload.type }]).select();
                    if (!error && data && data[0]) {
                        const mapped = {
                            ...payload,
                            id: data[0].id || payload.id,
                            patientId: data[0].patient_id || payload.patientId,
                            doctorId: data[0].doctor_id || payload.doctorId,
                            date: data[0].appointment_date || payload.date,
                            time: data[0].appointment_time || payload.time,
                            type: data[0].appointment_type || payload.type,
                            department: data[0].department || payload.department,
                            notes: data[0].notes || payload.notes
                        };
                        const next = [...appointments, mapped];
                        persistSeedTable('appointments', next);
                        setAppointments(next);
                        setShowNewAppointment(false);
                        return;
                    }
                }
                const next = [...appointments, payload];
                persistSeedTable('appointments', next);
                setAppointments(next);
                setShowNewAppointment(false);
            };

            const timeSlots = Array.from({ length: 24 }, (_, i) => {
                const hour = String(i).padStart(2, '0');
                return hour + ':00';
            });

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Appointments</h2>
                            <p className="text-slate-500 mt-1">Schedule and manage patient appointments</p>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex bg-slate-100 rounded-lg p-1">
                                <button onClick={() => setView('list')} className={'px-3 py-1.5 rounded-md text-sm font-medium transition-colors ' + (view === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>List</button>
                                <button onClick={() => setView('calendar')} className={'px-3 py-1.5 rounded-md text-sm font-medium transition-colors ' + (view === 'calendar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}>Calendar</button>
                            </div>
                            <Button variant="primary" icon={Icons.Plus} onClick={() => setShowNewAppointment(true)}>New Appointment</Button>
                        </div>
                    </div>

                    <Card>
                        <div className="flex items-center gap-4 mb-6">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                            <div className="flex gap-2">
                                <Badge variant="info">Scheduled: {filteredAppointments.filter(a => a.status === 'scheduled').length}</Badge>
                                <Badge variant="success">Completed: {filteredAppointments.filter(a => a.status === 'completed').length}</Badge>
                                <Badge variant="warning">In Progress: {filteredAppointments.filter(a => a.status === 'in-progress').length}</Badge>
                            </div>
                        </div>

                        {view === 'list' ? (
                            <DataTable
                                columns={[
                                    { key: 'time', title: 'Time' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return (
                                            <div className="flex items-center gap-2">
                                                <Avatar name={patient?.firstName + ' ' + patient?.lastName} size="sm" />
                                                <span>{patient?.firstName} {patient?.lastName}</span>
                                            </div>
                                        );
                                    }},
                                    { key: 'type', title: 'Type' },
                                    { key: 'department', title: 'Department' },
                                    { key: 'doctor', title: 'Doctor', render: (row) => {
                                        const doctor = seedData.users.find(u => u.id === row.doctorId);
                                        return doctor?.name || 'Unassigned';
                                    }},
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'in-progress' ? 'info' : row.status === 'cancelled' ? 'danger' : 'default'}>{row.status}</Badge> }
                                ]}
                                data={filteredAppointments.sort((a, b) => a.time.localeCompare(b.time))}
                                actions={(row) => (
                                    <>
                                        {row.status === 'scheduled' && <Button variant="primary" size="sm">Check In</Button>}
                                        <Button variant="ghost" size="sm" icon={Icons.MoreHorizontal} />
                                    </>
                                )}
                            />
                        ) : (
                            <div className="overflow-x-auto">
                                <div className="min-w-[800px]">
                                    <div className="grid grid-cols-[100px_repeat(7,1fr)] gap-2">
                                        <div className="text-xs font-medium text-slate-500 uppercase">Time</div>
                                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                            <div key={day} className="text-center text-xs font-medium text-slate-500 uppercase">{day}</div>
                                        ))}
                                        {timeSlots.slice(8, 18).map(time => (
                                            <React.Fragment key={time}>
                                                <div className="text-xs text-slate-400 py-2">{time}</div>
                                                {Array.from({ length: 7 }, (_, i) => (
                                                    <div key={i} className="border border-slate-100 rounded p-1 min-h-[40px] hover:bg-slate-50 transition-colors">
                                                        {Math.random() > 0.7 && (
                                                            <div className="bg-medical-100 text-medical-700 text-xs rounded px-1.5 py-0.5 truncate">
                                                                {seedData.patients[Math.floor(Math.random() * 50)].firstName}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>

                    <Modal
                        isOpen={showNewAppointment}
                        onClose={() => setShowNewAppointment(false)}
                        title="New Appointment"
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowNewAppointment(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleScheduleAppointment}>Schedule</Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <Select label="Patient" value={appointmentForm.patientId} onChange={(e) => setAppointmentForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(hydrateSeedData().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Select label="Department" value={appointmentForm.department} onChange={(e) => setAppointmentForm(prev => ({ ...prev, department: e.target.value }))} options={[{ value: '', label: 'Select department...' }, { value: 'cardiology', label: 'Cardiology' }, { value: 'orthopedics', label: 'Orthopedics' }, { value: 'general', label: 'General Medicine' }, { value: 'pediatrics', label: 'Pediatrics' }]} />
                            <Select label="Doctor" value={appointmentForm.doctorId} onChange={(e) => setAppointmentForm(prev => ({ ...prev, doctorId: e.target.value }))} options={[{ value: '', label: 'Select doctor...' }, { value: 'u2', label: 'Dr. Sarah Smith' }, { value: 'u3', label: 'Dr. Michael Jones' }]} />
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Date" type="date" value={appointmentForm.date} onChange={(e) => setAppointmentForm(prev => ({ ...prev, date: e.target.value }))} />
                                <Input label="Time" type="time" value={appointmentForm.time} onChange={(e) => setAppointmentForm(prev => ({ ...prev, time: e.target.value }))} />
                            </div>
                            <Select label="Appointment Type" value={appointmentForm.type} onChange={(e) => setAppointmentForm(prev => ({ ...prev, type: e.target.value }))} options={[{ value: '', label: 'Select type...' }, { value: 'consultation', label: 'Consultation' }, { value: 'followup', label: 'Follow-up' }, { value: 'emergency', label: 'Emergency' }, { value: 'routine', label: 'Routine Check' }]} />
                            <TextArea label="Notes" placeholder="Additional notes..." value={appointmentForm.notes} onChange={(e) => setAppointmentForm(prev => ({ ...prev, notes: e.target.value }))} />
                        </div>
                    </Modal>
                </div>
            );
        };

        // ==========================================
        // LABORATORY MODULE
        // ==========================================
        const LaboratoryModule = () => {
            const [activeTab, setActiveTab] = useState('orders');
            const [selectedOrder, setSelectedOrder] = useState(null);
            const [showResultEntry, setShowResultEntry] = useState(false);
            const [showNewOrder, setShowNewOrder] = useState(false);
            const [labOrders, setLabOrders] = useState(hydrateSeedData().labOrders || []);
            const [newOrderForm, setNewOrderForm] = useState({ patientId: '', testType: 'CBC', category: 'Hematology', priority: 'routine' });
            const [resultForm, setResultForm] = useState({ comments: '', values: {} });

            const tabs = [
                { id: 'orders', label: 'Lab Orders' },
                { id: 'results', label: 'Results' },
                { id: 'statistics', label: 'Statistics' },
            ];

            const handleCreateLabOrder = async () => {
                if (!newOrderForm.patientId) return;
                const payload = {
                    id: 'lab_' + Date.now(),
                    patientId: newOrderForm.patientId,
                    doctorId: 'u2',
                    testType: newOrderForm.testType,
                    category: newOrderForm.category,
                    status: 'pending',
                    priority: newOrderForm.priority,
                    orderedDate: new Date().toISOString().split('T')[0],
                    resultDate: null,
                    results: null,
                    technicianId: 'u5'
                };
                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                if (client) {
                    const { data, error } = await client.from('lab_orders').insert([{ ...payload, patient_id: payload.patientId, doctor_id: payload.doctorId, test_type: payload.testType, ordered_date: payload.orderedDate, technician_id: payload.technicianId, category: payload.category, priority: payload.priority, status: payload.status }]).select();
                    if (!error && data && data[0]) {
                        const mapped = { ...payload, id: data[0].id || payload.id, patientId: data[0].patient_id || payload.patientId, doctorId: data[0].doctor_id || payload.doctorId, testType: data[0].test_type || payload.testType, orderedDate: data[0].ordered_date || payload.orderedDate };
                        const next = [...labOrders, mapped];
                        persistSeedTable('labOrders', next);
                        setLabOrders(next);
                        setShowNewOrder(false);
                        return;
                    }
                }
                const next = [...labOrders, payload];
                persistSeedTable('labOrders', next);
                setLabOrders(next);
                setShowNewOrder(false);
            };

            const handleSaveResults = async () => {
                if (!selectedOrder) return;
                const nextOrder = {
                    ...selectedOrder,
                    status: 'completed',
                    resultDate: new Date().toISOString().split('T')[0],
                    results: { values: Object.entries(resultForm.values || {}).map(([parameter, value]) => ({ parameter, value, unit: 'unit', range: 'normal', flag: 'normal' })) }
                };
                const client = window.MedicoreSupabase && typeof window.MedicoreSupabase.getClient === 'function' ? window.MedicoreSupabase.getClient() : null;
                if (client) {
                    const { error } = await client.from('lab_orders').update({ status: 'completed', result_date: nextOrder.resultDate, results: nextOrder.results }).eq('id', selectedOrder.id);
                    if (!error) {
                        const next = labOrders.map(order => order.id === selectedOrder.id ? nextOrder : order);
                        persistSeedTable('labOrders', next);
                        setLabOrders(next);
                        setShowResultEntry(false);
                        return;
                    }
                }
                const next = labOrders.map(order => order.id === selectedOrder.id ? nextOrder : order);
                persistSeedTable('labOrders', next);
                setLabOrders(next);
                setShowResultEntry(false);
            };

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Laboratory</h2>
                            <p className="text-slate-500 mt-1">Manage lab orders and results</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus} onClick={() => setShowNewOrder(true)}>New Order</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Pending', value: seedData.labOrders.filter(l => l.status === 'pending').length, color: 'amber' },
                            { label: 'Processing', value: seedData.labOrders.filter(l => l.status === 'processing').length, color: 'medical' },
                            { label: 'Completed', value: seedData.labOrders.filter(l => l.status === 'completed').length, color: 'emerald' },
                            { label: 'Critical', value: seedData.labOrders.filter(l => l.status === 'critical').length, color: 'red' },
                        ].map(stat => (
                            <Card key={stat.label} className="text-center">
                                <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                                <p className="text-sm text-slate-500">{stat.label}</p>
                            </Card>
                        ))}
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'orders' && (
                        <Card>
                            <DataTable
                                columns={[
                                    { key: 'id', title: 'Order ID', className: 'font-mono text-xs' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'testType', title: 'Test' },
                                    { key: 'category', title: 'Category' },
                                    { key: 'priority', title: 'Priority', render: (row) => <Badge variant={row.priority === 'stat' ? 'danger' : row.priority === 'urgent' ? 'warning' : 'default'}>{row.priority}</Badge> },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'critical' ? 'danger' : row.status === 'completed' ? 'success' : 'warning'}>{row.status}</Badge> },
                                    { key: 'orderedDate', title: 'Ordered', render: (row) => formatDate(row.orderedDate) }
                                ]}
                                data={labOrders}
                                actions={(row) => (
                                    <>
                                        {row.status !== 'completed' && (
                                            <Button variant="primary" size="sm" onClick={() => { setSelectedOrder(row); setShowResultEntry(true); }}>Enter Results</Button>
                                        )}
                                        <Button variant="ghost" size="sm" icon={Icons.Eye}>View</Button>
                                    </>
                                )}
                            />
                        </Card>
                    )}

                    {activeTab === 'results' && (
                        <Card title="Completed Results">
                            <DataTable
                                columns={[
                                    { key: 'testType', title: 'Test' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'resultDate', title: 'Completed', render: (row) => formatDate(row.resultDate) },
                                    { key: 'results', title: 'Key Findings', render: (row) => {
                                        if (!row.results) return 'N/A';
                                        const abnormal = row.results.values.filter(v => v.flag !== 'normal');
                                        return abnormal.length > 0 ? abnormal.length + ' abnormal values' : 'All normal';
                                    }}
                                ]}
                                data={labOrders.filter(l => l.status === 'completed')}
                            />
                        </Card>
                    )}

                    {activeTab === 'statistics' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Tests by Category">
                                <BarChart 
                                    data={[
                                        { label: 'Hema', value: 45 },
                                        { label: 'Chem', value: 38 },
                                        { label: 'Micro', value: 22 },
                                        { label: 'Sero', value: 15 },
                                        { label: 'Histo', value: 8 }
                                    ]} 
                                    width={500} 
                                    height={250} 
                                    color="#2563eb" 
                                />
                            </Card>
                            <Card title="Turnaround Time Trend">
                                <LineChart 
                                    data={[
                                        { value: 4.2, label: 'W1' },
                                        { value: 3.8, label: 'W2' },
                                        { value: 3.5, label: 'W3' },
                                        { value: 3.2, label: 'W4' }
                                    ]} 
                                    width={500} 
                                    height={250} 
                                    color="#059669" 
                                />
                            </Card>
                        </div>
                    )}

                    <Modal
                        isOpen={showResultEntry}
                        onClose={() => setShowResultEntry(false)}
                        title={'Enter Results - ' + (selectedOrder?.testType || '')}
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowResultEntry(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleSaveResults}>Save Results</Button>
                            </div>
                        }
                    >
                        {selectedOrder && (
                            <div className="space-y-4">
                                <div className="p-3 bg-slate-50 rounded-lg">
                                    <p className="text-sm text-slate-600">Patient: {(() => {
                                        const p = seedData.patients.find(p => p.id === selectedOrder.patientId);
                                        return p ? p.firstName + ' ' + p.lastName : '';
                                    })()}</p>
                                    <p className="text-sm text-slate-600">Test: {selectedOrder.testType}</p>
                                </div>
                                <div className="space-y-3">
                                    {['WBC', 'RBC', 'Hemoglobin', 'Hematocrit', 'Platelets', 'MCV'].map(param => (
                                        <div key={param} className="grid grid-cols-3 gap-4 items-center">
                                            <span className="text-sm font-medium text-slate-700">{param}</span>
                                            <Input placeholder="Value" value={resultForm.values[param] || ''} onChange={(e) => setResultForm(prev => ({ ...prev, values: { ...prev.values, [param]: e.target.value } }))} />
                                            <span className="text-xs text-slate-500">Ref: 4.0-11.0</span>
                                        </div>
                                    ))}
                                </div>
                                <TextArea label="Comments" placeholder="Additional comments..." value={resultForm.comments} onChange={(e) => setResultForm(prev => ({ ...prev, comments: e.target.value }))} />
                            </div>
                        )}
                    </Modal>

                    <Modal
                        isOpen={showNewOrder}
                        onClose={() => setShowNewOrder(false)}
                        title="New Lab Order"
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setShowNewOrder(false)}>Cancel</Button>
                                <Button variant="primary" icon={Icons.Save} onClick={handleCreateLabOrder}>Create Order</Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <Select label="Patient" value={newOrderForm.patientId} onChange={(e) => setNewOrderForm(prev => ({ ...prev, patientId: e.target.value }))} options={[{ value: '', label: 'Select patient...' }, ...(hydrateSeedData().patients || []).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))]} />
                            <Input label="Test Type" value={newOrderForm.testType} onChange={(e) => setNewOrderForm(prev => ({ ...prev, testType: e.target.value }))} />
                            <Input label="Category" value={newOrderForm.category} onChange={(e) => setNewOrderForm(prev => ({ ...prev, category: e.target.value }))} />
                            <Select label="Priority" value={newOrderForm.priority} onChange={(e) => setNewOrderForm(prev => ({ ...prev, priority: e.target.value }))} options={[{ value: 'routine', label: 'Routine' }, { value: 'urgent', label: 'Urgent' }, { value: 'stat', label: 'Stat' }]} />
                        </div>
                    </Modal>
                </div>
            );
        };

        // ==========================================
        // RADIOLOGY MODULE
        // ==========================================
        const RadiologyModule = () => {
            const [selectedStudy, setSelectedStudy] = useState(null);

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Radiology</h2>
                            <p className="text-slate-500 mt-1">Imaging orders and reports</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus}>New Imaging Order</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {[
                            { label: 'X-Ray', value: seedData.radiologyOrders.filter(r => r.modality === 'X-Ray').length, icon: Icons.Image },
                            { label: 'MRI', value: seedData.radiologyOrders.filter(r => r.modality === 'MRI').length, icon: Icons.Image },
                            { label: 'CT', value: seedData.radiologyOrders.filter(r => r.modality === 'CT').length, icon: Icons.Image },
                            { label: 'Ultrasound', value: seedData.radiologyOrders.filter(r => r.modality === 'Ultrasound').length, icon: Icons.Image },
                            { label: 'ECG', value: seedData.radiologyOrders.filter(r => r.modality === 'ECG').length, icon: Icons.Activity },
                        ].map(mod => (
                            <Card key={mod.label} className="text-center hover-lift cursor-pointer">
                                <mod.icon size={24} className="mx-auto text-medical-600 mb-2" />
                                <p className="text-2xl font-bold text-slate-900">{mod.value}</p>
                                <p className="text-sm text-slate-500">{mod.label}</p>
                            </Card>
                        ))}
                    </div>

                    <Card>
                        <DataTable
                            columns={[
                                { key: 'id', title: 'Order ID', className: 'font-mono text-xs' },
                                { key: 'patient', title: 'Patient', render: (row) => {
                                    const patient = seedData.patients.find(p => p.id === row.patientId);
                                    return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                }},
                                { key: 'studyType', title: 'Study' },
                                { key: 'modality', title: 'Modality' },
                                { key: 'priority', title: 'Priority', render: (row) => <Badge variant={row.priority === 'stat' ? 'danger' : row.priority === 'urgent' ? 'warning' : 'default'}>{row.priority}</Badge> },
                                { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'reported' ? 'success' : row.status === 'completed' ? 'info' : 'warning'}>{row.status}</Badge> },
                                { key: 'scheduledDate', title: 'Scheduled', render: (row) => formatDate(row.scheduledDate) }
                            ]}
                            data={seedData.radiologyOrders}
                            actions={(row) => (
                                <>
                                    <Button variant="primary" size="sm" onClick={() => setSelectedStudy(row)}>View Images</Button>
                                    {row.status !== 'reported' && <Button variant="secondary" size="sm">Report</Button>}
                                </>
                            )}
                        />
                    </Card>

                    <Modal
                        isOpen={!!selectedStudy}
                        onClose={() => setSelectedStudy(null)}
                        title={selectedStudy?.studyType || ''}
                        size="lg"
                    >
                        {selectedStudy && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="aspect-square bg-slate-900 rounded-xl flex items-center justify-center">
                                        <div className="text-center text-slate-400">
                                            <Icons.Image size={48} className="mx-auto mb-2" />
                                            <p className="text-sm">DICOM Image Viewer</p>
                                            <p className="text-xs">Click to interact</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="p-4 bg-slate-50 rounded-lg">
                                            <h4 className="font-medium text-slate-900 mb-2">Study Information</h4>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between"><span className="text-slate-500">Modality:</span><span className="font-medium">{selectedStudy.modality}</span></div>
                                                <div className="flex justify-between"><span className="text-slate-500">Scheduled:</span><span className="font-medium">{formatDate(selectedStudy.scheduledDate)}</span></div>
                                                <div className="flex justify-between"><span className="text-slate-500">Images:</span><span className="font-medium">{(selectedStudy.images || []).length}</span></div>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-lg">
                                            <h4 className="font-medium text-slate-900 mb-2">Radiologist Report</h4>
                                            <p className="text-sm text-slate-600">{selectedStudy.report || 'No report available yet.'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Modal>
                </div>
            );
        };

        // ==========================================
        // PHARMACY MODULE
        // ==========================================
        const PharmacyModule = () => {
            const [activeTab, setActiveTab] = useState('dispensary');
            const [searchQuery, setSearchQuery] = useState('');

            const filteredDrugs = seedData.pharmacyInventory.filter(d => 
                d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                d.category.toLowerCase().includes(searchQuery.toLowerCase())
            );

            const tabs = [
                { id: 'dispensary', label: 'Dispensary' },
                { id: 'inventory', label: 'Inventory' },
                { id: 'prescriptions', label: 'Prescriptions' },
                { id: 'purchase', label: 'Purchase Orders' },
            ];

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Pharmacy</h2>
                            <p className="text-slate-500 mt-1">Medication dispensing and inventory</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" icon={Icons.ScanLine}>Scan Barcode</Button>
                            <Button variant="primary" icon={Icons.Plus}>Add Stock</Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Total Items" value={seedData.pharmacyInventory.length} icon={Icons.Package} color="medical" />
                        <StatCard title="Low Stock" value={seedData.pharmacyInventory.filter(d => d.status === 'low_stock').length} icon={Icons.AlertCircle} color="amber" />
                        <StatCard title="Expiring Soon" value={seedData.pharmacyInventory.filter(d => {
                            const expiry = new Date(d.expiryDate);
                            const threeMonths = new Date('2026-09-01');
                            threeMonths.setMonth(threeMonths.getMonth() + 3);
                            return expiry <= threeMonths;
                        }).length} icon={Icons.Clock} color="red" />
                        <StatCard title="Today's Sales" value={formatCurrency(1245.50)} icon={Icons.DollarSign} color="emerald" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'dispensary' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card title="Pending Prescriptions" className="lg:col-span-2">
                                <DataTable
                                    columns={[
                                        { key: 'id', title: 'Rx ID', className: 'font-mono text-xs' },
                                        { key: 'patient', title: 'Patient', render: (row) => {
                                            const patient = seedData.patients.find(p => p.id === row.patientId);
                                            return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                        }},
                                        { key: 'diagnosis', title: 'Diagnosis' },
                                        { key: 'medications', title: 'Items', render: (row) => row.medications.length },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge> }
                                    ]}
                                    data={seedData.prescriptions.filter(p => p.status === 'active')}
                                    actions={(row) => (
                                        <Button variant="primary" size="sm" icon={Icons.Check}>Dispense</Button>
                                    )}
                                />
                            </Card>
                            <Card title="Quick Dispense">
                                <div className="space-y-4">
                                    <SearchBar placeholder="Search medication..." />
                                    <div className="space-y-2">
                                        {seedData.pharmacyInventory.slice(0, 5).map(drug => (
                                            <div key={drug.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-900">{drug.name}</p>
                                                    <p className="text-xs text-slate-500">{drug.category} - Stock: {drug.stockQuantity}</p>
                                                </div>
                                                <Button variant="ghost" size="sm" icon={Icons.Plus} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                        </div>
                    )}

                    {activeTab === 'inventory' && (
                        <Card>
                            <div className="mb-4">
                                <SearchBar
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search drugs by name or category..."
                                />
                            </div>
                            <DataTable
                                columns={[
                                    { key: 'name', title: 'Drug Name' },
                                    { key: 'genericName', title: 'Generic Name' },
                                    { key: 'category', title: 'Category' },
                                    { key: 'stockQuantity', title: 'Stock', render: (row) => (
                                        <div className="flex items-center gap-2">
                                            <span className={row.stockQuantity < row.reorderLevel ? 'text-red-600 font-medium' : ''}>{row.stockQuantity}</span>
                                            {row.stockQuantity < row.reorderLevel && <Badge variant="danger">Low</Badge>}
                                        </div>
                                    )},
                                    { key: 'unitPrice', title: 'Price', render: (row) => formatCurrency(row.unitPrice) },
                                    { key: 'expiryDate', title: 'Expiry', render: (row) => {
                                        const expiry = new Date(row.expiryDate);
                                        const today = new Date('2026-09-01');
                                        const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
                                        return (
                                            <span className={diff < 90 ? 'text-red-600 font-medium' : diff < 180 ? 'text-amber-600' : 'text-slate-600'}>
                                                {formatDate(row.expiryDate)}
                                            </span>
                                        );
                                    }},
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'low_stock' ? 'warning' : row.status === 'expired' ? 'danger' : 'success'}>{row.status}</Badge> }
                                ]}
                                data={filteredDrugs}
                                actions={(row) => (
                                    <>
                                        <Button variant="ghost" size="sm" icon={Icons.Edit} />
                                    </>
                                )}
                            />
                        </Card>
                    )}

                    {activeTab === 'prescriptions' && (
                        <Card>
                            <DataTable
                                columns={[
                                    { key: 'id', title: 'Rx ID' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'doctor', title: 'Doctor', render: (row) => {
                                        const doctor = seedData.users.find(u => u.id === row.doctorId);
                                        return doctor?.name || 'Unknown';
                                    }},
                                    { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                    { key: 'diagnosis', title: 'Diagnosis' },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : row.status === 'dispensed' ? 'info' : 'default'}>{row.status}</Badge> }
                                ]}
                                data={seedData.prescriptions}
                            />
                        </Card>
                    )}

                    {activeTab === 'purchase' && (
                        <Card title="Purchase Orders">
                            <div className="text-center py-12">
                                <Icons.ShoppingCart size={48} className="mx-auto text-slate-300 mb-4" />
                                <p className="text-slate-500">No active purchase orders</p>
                                <Button variant="primary" icon={Icons.Plus} className="mt-4">Create PO</Button>
                            </div>
                        </Card>
                    )}
                </div>
            );
        };

        // ==========================================
        // BILLING MODULE
        // ==========================================
        const BillingModule = () => {
            const [activeTab, setActiveTab] = useState('invoices');
            const [selectedInvoice, setSelectedInvoice] = useState(null);

            const tabs = [
                { id: 'invoices', label: 'Invoices' },
                { id: 'payments', label: 'Payments' },
                { id: 'insurance', label: 'Insurance Claims' },
                { id: 'reports', label: 'Financial Reports' },
            ];

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Billing</h2>
                            <p className="text-slate-500 mt-1">Invoices, payments, and insurance</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus}>Create Invoice</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Total Revenue" value={formatCurrency(seedData.billing.reduce((s, b) => s + parseFloat(b.total), 0))} icon={Icons.DollarSign} color="emerald" />
                        <StatCard title="Outstanding" value={formatCurrency(seedData.billing.reduce((s, b) => s + parseFloat(b.balance), 0))} icon={Icons.AlertCircle} color="amber" />
                        <StatCard title="Paid Today" value={formatCurrency(3250.00)} icon={Icons.CheckCircle} color="medical" />
                        <StatCard title="Pending Claims" value={seedData.insuranceClaims.filter(c => c.status === 'pending').length} icon={Icons.Shield} color="violet" />
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    {activeTab === 'invoices' && (
                        <Card>
                            <DataTable
                                columns={[
                                    { key: 'invoiceNumber', title: 'Invoice', className: 'font-mono text-xs' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                    { key: 'total', title: 'Total', render: (row) => formatCurrency(row.total) },
                                    { key: 'paid', title: 'Paid', render: (row) => formatCurrency(row.paid) },
                                    { key: 'balance', title: 'Balance', render: (row) => <span className={parseFloat(row.balance) > 0 ? 'text-red-600 font-medium' : 'text-emerald-600'}>{formatCurrency(row.balance)}</span> },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'paid' ? 'success' : row.status === 'partial' ? 'warning' : row.status === 'overdue' ? 'danger' : 'default'}>{row.status}</Badge> }
                                ]}
                                data={seedData.billing}
                                actions={(row) => (
                                    <>
                                        <Button variant="primary" size="sm" onClick={() => setSelectedInvoice(row)}>View</Button>
                                        {row.status !== 'paid' && <Button variant="success" size="sm" icon={Icons.DollarSign}>Pay</Button>}
                                    </>
                                )}
                            />
                        </Card>
                    )}

                    {activeTab === 'payments' && (
                        <Card title="Recent Payments">
                            <DataTable
                                columns={[
                                    { key: 'invoiceNumber', title: 'Invoice' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'paid', title: 'Amount', render: (row) => formatCurrency(row.paid) },
                                    { key: 'paymentMethod', title: 'Method' },
                                    { key: 'date', title: 'Date', render: (row) => formatDate(row.date) }
                                ]}
                                data={seedData.billing.filter(b => parseFloat(b.paid) > 0)}
                            />
                        </Card>
                    )}

                    {activeTab === 'insurance' && (
                        <Card>
                            <DataTable
                                columns={[
                                    { key: 'claimNumber', title: 'Claim #' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'provider', title: 'Provider' },
                                    { key: 'amountClaimed', title: 'Claimed', render: (row) => formatCurrency(row.amountClaimed) },
                                    { key: 'amountApproved', title: 'Approved', render: (row) => formatCurrency(row.amountApproved) },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'approved' || row.status === 'paid' ? 'success' : row.status === 'denied' ? 'danger' : 'warning'}>{row.status}</Badge> }
                                ]}
                                data={seedData.insuranceClaims}
                            />
                        </Card>
                    )}

                    {activeTab === 'reports' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Revenue by Department">
                                <BarChart 
                                    data={[
                                        { label: 'Consult', value: 35000 },
                                        { label: 'Lab', value: 28000 },
                                        { label: 'Radio', value: 22000 },
                                        { label: 'Pharm', value: 18000 },
                                        { label: 'Surgery', value: 45000 }
                                    ]} 
                                    width={500} 
                                    height={250} 
                                    color="#2563eb" 
                                />
                            </Card>
                            <Card title="Payment Methods">
                                <div className="space-y-4">
                                    {[
                                        { method: 'Cash', amount: 45000, percent: 35 },
                                        { method: 'Card', amount: 38000, percent: 30 },
                                        { method: 'Insurance', amount: 32000, percent: 25 },
                                        { method: 'Bank Transfer', amount: 13000, percent: 10 },
                                    ].map(p => (
                                        <div key={p.method}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-slate-700">{p.method}</span>
                                                <span className="font-medium text-slate-900">{formatCurrency(p.amount)} ({p.percent}%)</span>
                                            </div>
                                            <ProgressBar value={p.percent} max={100} color="emerald" size="sm" />
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}

                    <Modal
                        isOpen={!!selectedInvoice}
                        onClose={() => setSelectedInvoice(null)}
                        title={'Invoice ' + (selectedInvoice?.invoiceNumber || '')}
                        size="md"
                        footer={
                            <div className="flex justify-end gap-3">
                                <Button variant="secondary" icon={Icons.Printer}>Print</Button>
                                <Button variant="primary" icon={Icons.Download}>Download PDF</Button>
                            </div>
                        }
                    >
                        {selectedInvoice && (
                            <div className="space-y-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Date:</span>
                                    <span className="font-medium">{formatDate(selectedInvoice.date)}</span>
                                </div>
                                <div className="border-t border-slate-100 pt-4">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-slate-500 border-b border-slate-100">
                                                <th className="pb-2">Item</th>
                                                <th className="pb-2 text-right">Qty</th>
                                                <th className="pb-2 text-right">Price</th>
                                                <th className="pb-2 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedInvoice.items.map((item, i) => (
                                                <tr key={i} className="border-b border-slate-50">
                                                    <td className="py-2">{item.description}</td>
                                                    <td className="py-2 text-right">{item.quantity}</td>
                                                    <td className="py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                                                    <td className="py-2 text-right font-medium">{formatCurrency(item.total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between"><span className="text-slate-500">Subtotal:</span><span>{formatCurrency(selectedInvoice.subtotal)}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Discount:</span><span>-{formatCurrency(selectedInvoice.discount)}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Tax:</span><span>{formatCurrency(selectedInvoice.tax)}</span></div>
                                    <div className="flex justify-between text-base font-bold border-t border-slate-100 pt-2">
                                        <span>Total:</span>
                                        <span>{formatCurrency(selectedInvoice.total)}</span>
                                    </div>
                                    <div className="flex justify-between text-emerald-600">
                                        <span>Paid:</span>
                                        <span>{formatCurrency(selectedInvoice.paid)}</span>
                                    </div>
                                    <div className="flex justify-between text-red-600 font-medium">
                                        <span>Balance:</span>
                                        <span>{formatCurrency(selectedInvoice.balance)}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Modal>
                </div>
            );
        };

        // ==========================================
        // ADMISSIONS / WARD MODULE
        // ==========================================
        const AdmissionsModule = () => {
            const [selectedWard, setSelectedWard] = useState(null);

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Ward Management</h2>
                            <p className="text-slate-500 mt-1">Bed allocation and patient admissions</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus}>New Admission</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {seedData.wards.map(ward => (
                            <Card 
                                key={ward.id} 
                                className="cursor-pointer hover:border-medical-300 transition-colors"
                                onClick={() => setSelectedWard(ward)}
                            >
                                <div className="text-center">
                                    <div className={'w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ' + (ward.occupied >= ward.capacity * 0.9 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600')}>
                                        <Icons.Bed size={24} />
                                    </div>
                                    <h3 className="font-semibold text-slate-900">{ward.name}</h3>
                                    <p className="text-2xl font-bold text-slate-900 mt-1">{ward.occupied}/{ward.capacity}</p>
                                    <p className="text-xs text-slate-500">{Math.round((ward.occupied / ward.capacity) * 100)}% occupied</p>
                                    <div className="mt-2">
                                        <ProgressBar value={ward.occupied} max={ward.capacity} color={ward.occupied >= ward.capacity * 0.9 ? 'red' : 'emerald'} size="sm" />
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>

                    <Card title="Current Admissions">
                        <DataTable
                            columns={[
                                { key: 'patient', title: 'Patient', render: (row) => {
                                    const patient = seedData.patients.find(p => p.id === row.patientId);
                                    return (
                                        <div className="flex items-center gap-2">
                                            <Avatar name={patient?.firstName + ' ' + patient?.lastName} size="sm" />
                                            <span>{patient?.firstName} {patient?.lastName}</span>
                                        </div>
                                    );
                                }},
                                { key: 'ward', title: 'Ward' },
                                { key: 'bedNumber', title: 'Bed' },
                                { key: 'admissionDate', title: 'Admitted', render: (row) => formatDate(row.admissionDate) },
                                { key: 'diagnosis', title: 'Diagnosis' },
                                { key: 'doctor', title: 'Doctor', render: (row) => {
                                    const doctor = seedData.users.find(u => u.id === row.doctorId);
                                    return doctor?.name || 'Unknown';
                                }},
                                { key: 'acuity', title: 'Acuity', render: (row) => <Badge variant={row.acuity === 'critical' ? 'danger' : row.acuity === 'moderate' ? 'warning' : 'success'}>{row.acuity}</Badge> }
                            ]}
                            data={seedData.admissions.filter(a => a.status === 'active')}
                            actions={(row) => (
                                <>
                                    <Button variant="primary" size="sm">Transfer</Button>
                                    <Button variant="secondary" size="sm">Discharge</Button>
                                </>
                            )}
                        />
                    </Card>

                    <Modal
                        isOpen={!!selectedWard}
                        onClose={() => setSelectedWard(null)}
                        title={(selectedWard?.name || '') + ' - Bed Map'}
                        size="lg"
                    >
                        {selectedWard && (
                            <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                                {seedData.beds.filter(b => b.wardId === selectedWard.id).map(bed => (
                                    <div 
                                        key={bed.id} 
                                        className={'p-4 rounded-xl border-2 text-center cursor-pointer transition-all ' + (bed.status === 'occupied' ? 'border-red-200 bg-red-50' : bed.status === 'available' ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : 'border-slate-200 bg-slate-50')}
                                    >
                                        <Icons.Bed size={24} className={'mx-auto mb-2 ' + (bed.status === 'occupied' ? 'text-red-500' : bed.status === 'available' ? 'text-emerald-500' : 'text-slate-400')} />
                                        <p className="text-xs font-medium text-slate-700">{bed.bedNumber}</p>
                                        <Badge variant={bed.status === 'occupied' ? 'danger' : bed.status === 'available' ? 'success' : 'default'} className="mt-1 text-xs">{bed.status}</Badge>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Modal>
                </div>
            );
        };

        // ==========================================
        // SURGERIES MODULE
        // ==========================================
        const SurgeriesModule = () => {
            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Operating Theatre</h2>
                            <p className="text-slate-500 mt-1">Surgery scheduling and management</p>
                        </div>
                        <Button variant="primary" icon={Icons.Plus}>Schedule Surgery</Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Scheduled Today" value={seedData.surgeries.filter(s => s.scheduledDate === '2026-09-01').length} icon={Icons.Calendar} color="medical" />
                        <StatCard title="In Progress" value={seedData.surgeries.filter(s => s.status === 'in-progress').length} icon={Icons.Activity} color="amber" />
                        <StatCard title="Completed" value={seedData.surgeries.filter(s => s.status === 'completed').length} icon={Icons.CheckCircle} color="emerald" />
                        <StatCard title="Emergency" value={seedData.surgeries.filter(s => s.priority === 'emergency').length} icon={Icons.AlertCircle} color="red" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card title="OT Schedule" className="lg:col-span-2">
                            <DataTable
                                columns={[
                                    { key: 'scheduledTime', title: 'Time' },
                                    { key: 'procedure', title: 'Procedure' },
                                    { key: 'patient', title: 'Patient', render: (row) => {
                                        const patient = seedData.patients.find(p => p.id === row.patientId);
                                        return patient ? patient.firstName + ' ' + patient.lastName : 'Unknown';
                                    }},
                                    { key: 'surgeon', title: 'Surgeon', render: (row) => {
                                        const surgeon = seedData.users.find(u => u.id === row.surgeonId);
                                        return surgeon?.name || 'Unknown';
                                    }},
                                    { key: 'otRoom', title: 'OT Room' },
                                    { key: 'priority', title: 'Priority', render: (row) => <Badge variant={row.priority === 'emergency' ? 'danger' : row.priority === 'urgent' ? 'warning' : 'default'}>{row.priority}</Badge> },
                                    { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'in-progress' ? 'info' : 'default'}>{row.status}</Badge> }
                                ]}
                                data={seedData.surgeries.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))}
                                actions={(row) => (
                                    <Button variant="primary" size="sm">Details</Button>
                                )}
                            />
                        </Card>
                        <Card title="OT Rooms Status">
                            <div className="space-y-3">
                                {Array.from({ length: 6 }, (_, i) => {
                                    const room = 'OT-' + (i + 1);
                                    const currentSurgery = seedData.surgeries.find(s => s.otRoom === room && s.status === 'in-progress');
                                    return (
                                        <div key={room} className={'p-3 rounded-lg border ' + (currentSurgery ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200')}>
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-slate-900">{room}</span>
                                                <Badge variant={currentSurgery ? 'danger' : 'success'}>{currentSurgery ? 'Occupied' : 'Available'}</Badge>
                                            </div>
                                            {currentSurgery && (
                                                <p className="text-xs text-slate-600 mt-1">{currentSurgery.procedure}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    </div>
                </div>
            );
        };

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

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Reports</h2>
                            <p className="text-slate-500 mt-1">Generate and view hospital reports</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" icon={Icons.Calendar}>Date Range</Button>
                            <Button variant="primary" icon={Icons.Download}>Export</Button>
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

        // ==========================================
        // AUDIT LOGS MODULE
        // ==========================================
        const AuditModule = () => {
            const [filterSeverity, setFilterSeverity] = useState('all');

            const filteredLogs = seedData.auditLogs.filter(log => 
                filterSeverity === 'all' || log.severity === filterSeverity
            );

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Audit Logs</h2>
                            <p className="text-slate-500 mt-1">System activity and security monitoring</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" icon={Icons.Filter}>Filter</Button>
                            <Button variant="secondary" icon={Icons.Download}>Export</Button>
                        </div>
                    </div>

                    <Card>
                        <div className="flex gap-4 mb-6">
                            {['all', 'info', 'warning', 'critical'].map(sev => (
                                <button
                                    key={sev}
                                    onClick={() => setFilterSeverity(sev)}
                                    className={'px-4 py-2 rounded-lg text-sm font-medium transition-colors ' + (filterSeverity === sev ? 'bg-medical-100 text-medical-700' : 'text-slate-600 hover:bg-slate-100')}
                                >
                                    {sev.charAt(0).toUpperCase() + sev.slice(1)}
                                </button>
                            ))}
                        </div>

                        <DataTable
                            columns={[
                                { key: 'timestamp', title: 'Timestamp', render: (row) => formatDateTime(row.timestamp), className: 'whitespace-nowrap' },
                                { key: 'user', title: 'User', render: (row) => {
                                    const user = seedData.users.find(u => u.id === row.userId);
                                    return user ? (
                                        <div className="flex items-center gap-2">
                                            <Avatar name={user.name} size="sm" />
                                            <span>{user.name}</span>
                                        </div>
                                    ) : row.userId;
                                }},
                                { key: 'action', title: 'Action', render: (row) => <Badge variant="info">{row.action}</Badge> },
                                { key: 'entityType', title: 'Entity' },
                                { key: 'ipAddress', title: 'IP Address', className: 'font-mono text-xs' },
                                { key: 'severity', title: 'Severity', render: (row) => <Badge variant={row.severity === 'critical' ? 'danger' : row.severity === 'warning' ? 'warning' : 'default'}>{row.severity}</Badge> }
                            ]}
                            data={filteredLogs}
                            actions={(row) => (
                                <Button variant="ghost" size="sm" icon={Icons.Eye}>Details</Button>
                            )}
                        />
                    </Card>
                </div>
            );
        };

        // ==========================================
        // SETTINGS MODULE
        // ==========================================
        const SettingsModule = () => {
            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card title="General Settings">
                            <div className="space-y-4">
                                <Input label="Hospital Name" value="MediCore General Hospital" onChange={() => {}} />
                                <Input label="Address" value="123 Healthcare Avenue, Medical City" onChange={() => {}} />
                                <Input label="Phone" value="+1-555-MEDICORE" onChange={() => {}} />
                                <Input label="Email" value="admin@medicore.com" type="email" onChange={() => {}} />
                                <Input label="Website" value="www.medicore.com" onChange={() => {}} />
                            </div>
                        </Card>

                        <Card title="System Configuration">
                            <div className="space-y-4">
                                <Select label="Timezone" options={[{ value: 'UTC', label: 'UTC' }, { value: 'EST', label: 'Eastern Time' }, { value: 'PST', label: 'Pacific Time' }]} value="UTC" onChange={() => {}} />
                                <Select label="Date Format" options={[{ value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' }, { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' }, { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }]} value="MM/DD/YYYY" onChange={() => {}} />
                                <Select label="Currency" options={[{ value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' }, { value: 'GBP', label: 'GBP (£)' }]} value="USD" onChange={() => {}} />
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-700">Auto-logout</span>
                                    <span className="text-sm font-medium text-slate-900">15 minutes</span>
                                </div>
                            </div>
                        </Card>

                        <Card title="Security Settings">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-700">Two-Factor Authentication</span>
                                    <Badge variant="success">Enabled</Badge>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-700">Password Expiry</span>
                                    <span className="text-sm font-medium text-slate-900">90 days</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-700">Session Timeout</span>
                                    <span className="text-sm font-medium text-slate-900">30 minutes</span>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm text-slate-700">Audit Logging</span>
                                    <Badge variant="success">Active</Badge>
                                </div>
                                <Button variant="secondary" className="w-full" icon={Icons.Lock}>Change Password Policy</Button>
                            </div>
                        </Card>
                    </div>

                    <Card title="Department Configuration">
                        <DataTable
                            columns={[
                                { key: 'name', title: 'Department' },
                                { key: 'type', title: 'Type' },
                                { key: 'capacity', title: 'Capacity' },
                                { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge> }
                            ]}
                            data={seedData.wards}
                            actions={() => (
                                <Button variant="ghost" size="sm" icon={Icons.Edit} />
                            )}
                        />
                    </Card>
                </div>
            );
        };

        // ==========================================
        // PATIENT PORTAL MODULE
        // ==========================================
        const PatientPortalModule = () => {
            const { user } = useAuth();
            const patient = seedData.patients.find(p => p.patientId === user?.patientId) || seedData.patients[0];
            const [activeTab, setActiveTab] = useState('overview');

            const tabs = [
                { id: 'overview', label: 'Overview' },
                { id: 'appointments', label: 'Appointments' },
                { id: 'lab_results', label: 'Lab Results' },
                { id: 'prescriptions', label: 'Prescriptions' },
                { id: 'billing', label: 'Billing' },
                { id: 'messages', label: 'Messages' },
            ];

            return (
                <div className="p-6 space-y-6 animate-fade-in">
                    <div className="flex items-center gap-4 mb-6">
                        <Avatar name={patient.firstName + ' ' + patient.lastName} size="xl" />
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">Welcome, {patient.firstName}</h2>
                            <p className="text-slate-500">Patient ID: {patient.patientNumber}</p>
                        </div>
                    </div>

                    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

                    <div className="mt-6">
                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <Card title="My Information" className="lg:col-span-2">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><p className="text-xs text-slate-500">Full Name</p><p className="font-medium">{patient.firstName} {patient.lastName}</p></div>
                                        <div><p className="text-xs text-slate-500">Date of Birth</p><p className="font-medium">{formatDate(patient.dateOfBirth)}</p></div>
                                        <div><p className="text-xs text-slate-500">Blood Group</p><p className="font-medium">{patient.bloodGroup}</p></div>
                                        <div><p className="text-xs text-slate-500">Phone</p><p className="font-medium">{patient.phone}</p></div>
                                        <div><p className="text-xs text-slate-500">Email</p><p className="font-medium">{patient.email}</p></div>
                                        <div><p className="text-xs text-slate-500">Address</p><p className="font-medium">{patient.address}</p></div>
                                    </div>
                                </Card>
                                <Card title="Quick Links">
                                    <div className="space-y-2">
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.Calendar}>Book Appointment</Button>
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.MessageSquare}>Message Doctor</Button>
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.Download}>Download Records</Button>
                                        <Button variant="secondary" className="w-full justify-start" icon={Icons.CreditCard}>Pay Bill</Button>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {activeTab === 'appointments' && (
                            <Card>
                                <DataTable
                                    columns={[
                                        { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                        { key: 'time', title: 'Time' },
                                        { key: 'type', title: 'Type' },
                                        { key: 'department', title: 'Department' },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'scheduled' ? 'info' : 'default'}>{row.status}</Badge> }
                                    ]}
                                    data={seedData.appointments.filter(a => a.patientId === patient.id)}
                                />
                            </Card>
                        )}

                        {activeTab === 'lab_results' && (
                            <Card>
                                <DataTable
                                    columns={[
                                        { key: 'testType', title: 'Test' },
                                        { key: 'category', title: 'Category' },
                                        { key: 'orderedDate', title: 'Date', render: (row) => formatDate(row.orderedDate) },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : 'warning'}>{row.status}</Badge> },
                                        { key: 'results', title: 'Results', render: (row) => row.results ? <Button variant="primary" size="sm">View</Button> : 'Pending' }
                                    ]}
                                    data={seedData.labOrders.filter(l => l.patientId === patient.id)}
                                />
                            </Card>
                        )}

                        {activeTab === 'prescriptions' && (
                            <Card>
                                <DataTable
                                    columns={[
                                        { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                        { key: 'diagnosis', title: 'Diagnosis' },
                                        { key: 'medications', title: 'Medications', render: (row) => row.medications.map(m => m.name).join(', ') },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'active' ? 'success' : 'default'}>{row.status}</Badge> }
                                    ]}
                                    data={seedData.prescriptions.filter(p => p.patientId === patient.id)}
                                />
                            </Card>
                        )}

                        {activeTab === 'billing' && (
                            <Card>
                                <DataTable
                                    columns={[
                                        { key: 'invoiceNumber', title: 'Invoice' },
                                        { key: 'date', title: 'Date', render: (row) => formatDate(row.date) },
                                        { key: 'total', title: 'Total', render: (row) => formatCurrency(row.total) },
                                        { key: 'balance', title: 'Balance', render: (row) => formatCurrency(row.balance) },
                                        { key: 'status', title: 'Status', render: (row) => <Badge variant={row.status === 'paid' ? 'success' : 'warning'}>{row.status}</Badge> },
                                        { key: 'action', title: 'Action', render: (row) => row.status !== 'paid' ? <Button variant="primary" size="sm">Pay Now</Button> : <span className="text-emerald-600 text-sm">Paid</span> }
                                    ]}
                                    data={seedData.billing.filter(b => b.patientId === patient.id)}
                                />
                            </Card>
                        )}

                        {activeTab === 'messages' && (
                            <Card title="Messages">
                                <div className="space-y-4">
                                    <div className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                                        <Avatar name="Dr. Smith" size="sm" />
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <p className="font-medium text-sm">Dr. Sarah Smith</p>
                                                <span className="text-xs text-slate-400">2 hours ago</span>
                                            </div>
                                            <p className="text-sm text-slate-600 mt-1">Your lab results are ready. Please schedule a follow-up appointment to discuss the findings.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <textarea
                                            placeholder="Type your message..."
                                            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm resize-none"
                                            rows={3}
                                        />
                                        <Button variant="primary" icon={Icons.Send} className="self-end">Send</Button>
                                    </div>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            );
        };

        // ==========================================
        // MAIN APP LAYOUT
        // ==========================================
        const App = () => {
            const [isAuthenticated, setIsAuthenticated] = useState(false);
            const [activeModule, setActiveModule] = useState('dashboard');
            const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
            const [notifications, setNotifications] = useState(seedData.notifications);
            const [toasts, setToasts] = useState([]);

            const { user } = useAuth();

            useEffect(() => {
                try {
                    const saved = localStorage.getItem('medicore_user');
                    if (saved) setIsAuthenticated(true);
                } catch (e) {}
            }, []);

            const handleLogin = () => setIsAuthenticated(true);

            const addToast = (message, type = 'info') => {
                const id = Date.now();
                setToasts(prev => [...prev, { id, message, type }]);
                setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
            };

            const renderModule = () => {
                switch (activeModule) {
                    case 'dashboard': return <DashboardModule />;
                    case 'patients': return <PatientsModule />;
                    case 'appointments': return <AppointmentsModule />;
                    case 'laboratory': return <LaboratoryModule />;
                    case 'radiology': return <RadiologyModule />;
                    case 'pharmacy': return <PharmacyModule />;
                    case 'billing': return <BillingModule />;
                    case 'admissions': return <AdmissionsModule />;
                    case 'ward': return <AdmissionsModule />;
                    case 'surgeries': return <SurgeriesModule />;
                    case 'reports': return <ReportsModule />;
                    case 'audit': return <AuditModule />;
                    case 'settings': return <SettingsModule />;
                    case 'portal': return <PatientPortalModule />;
                    case 'lab_results': return <PatientPortalModule />;
                    case 'prescriptions': return <PatientPortalModule />;
                    case 'messages': return <PatientPortalModule />;
                    default: return <DashboardModule />;
                }
            };

            if (!isAuthenticated) {
                return <LoginPage onLogin={handleLogin} />;
            }

            return (
                <div className="flex h-screen bg-slate-50">
                    <Sidebar 
                        activeModule={activeModule} 
                        onModuleChange={setActiveModule}
                        collapsed={sidebarCollapsed}
                        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                    />
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        <Header 
                            notifications={notifications}
                            onNotificationClick={(notif) => {
                                setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
                            }}
                        />
                        <main className="flex-1 overflow-y-auto">
                            {renderModule()}
                        </main>
                    </div>
                    <div className="fixed bottom-4 right-4 space-y-2 z-50">
                        {toasts.map(toast => (
                            <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} />
                        ))}
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
    