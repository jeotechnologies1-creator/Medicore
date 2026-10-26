        // ==========================================
        // UI COMPONENTS
        // ==========================================
        const Button = ({ children, variant = 'primary', size = 'md', className = '', onClick, disabled, type = 'button', icon: Icon, ...props }) => {
            // Do not render controls that have no behavior. This prevents demo-only
            // buttons from appearing actionable in the clinical application.
            if (type === 'button' && typeof onClick !== 'function') return null;
            if ((type === 'reset' || type === 'submit') && typeof onClick !== 'function') {
                // keep real form controls active so login and other forms can submit normally
            }
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
                    {...props}
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
            <div className={'luxury-card bg-white rounded-2xl border border-slate-200 shadow-sm hover-lift ' + className}>
                {(title || subtitle || action) && (
                    <div className="card-header px-6 py-4 border-b border-slate-100 flex items-center justify-between">
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

        const Input = ({ label, type = 'text', placeholder, value, onChange, className = '', required, icon: Icon, error, ...props }) => {
            const generatedId = React.useId();
            const inputId = props.id || `field-${generatedId.replaceAll(':', '')}`;
            return (
            <div className={className}>
                {label && <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-1.5">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>}
                <div className="relative">
                    {Icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon size={18} /></div>}
                    <input
                        id={inputId}
                        type={type}
                        value={value}
                        onChange={onChange}
                        placeholder={placeholder}
                        className={'w-full rounded-lg border ' + (error ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : 'border-slate-300 focus:border-medical-500 focus:ring-medical-200') + ' focus:ring-2 focus:ring-opacity-50 outline-none transition-all ' + (Icon ? 'pl-10' : 'pl-4') + ' pr-4 py-2.5 text-sm ' + (error ? 'text-red-900 placeholder-red-300' : 'text-slate-900 placeholder-slate-400')}
                        required={required}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? `${inputId}-error` : undefined}
                        {...props}
                    />
                </div>
                {error && <p id={`${inputId}-error`} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
            </div>
            );
        };

        const Select = ({ label, value, onChange, options, className = '', required, error, disabled = false, ...props }) => {
            const generatedId = React.useId();
            const selectId = props.id || `field-${generatedId.replaceAll(':', '')}`;
            return (
            <div className={className}>
                {label && <label htmlFor={selectId} className="block text-sm font-medium text-slate-700 mb-1.5">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>}
                <select
                    id={selectId}
                    value={value}
                    onChange={onChange}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${selectId}-error` : undefined}
                    className={'w-full rounded-lg border focus:ring-2 focus:ring-opacity-50 outline-none transition-all pl-4 pr-8 py-2.5 text-sm text-slate-900 bg-white ' + (error ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : 'border-slate-300 focus:border-medical-500 focus:ring-medical-200')}
                    required={required}
                    disabled={disabled}
                    {...props}
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                {error && <p id={`${selectId}-error`} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
            </div>
            );
        };

        const TextArea = ({ label, placeholder, value, onChange, className = '', rows = 3, required, disabled = false, error, ...props }) => {
            const generatedId = React.useId();
            const textareaId = props.id || `field-${generatedId.replaceAll(':', '')}`;
            return (
            <div className={className}>
                {label && <label htmlFor={textareaId} className="block text-sm font-medium text-slate-700 mb-1.5">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>}
                <textarea
                    id={textareaId}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    rows={rows}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${textareaId}-error` : undefined}
                    className={'w-full rounded-lg border border-slate-300 focus:border-medical-500 focus:ring-2 focus:ring-medical-200 focus:ring-opacity-50 outline-none transition-all px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 resize-vertical ' + (error ? 'border-red-400' : '')}
                    required={required}
                    disabled={disabled}
                    {...props}
                />
                {error && <p id={`${textareaId}-error`} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
            </div>
            );
        };

        const Modal = ({ isOpen, onClose, title, children, size = 'md', footer }) => {
            const modalTitleId = `onemed-modal-title-${React.useId().replaceAll(':', '')}`;
            const dialogRef = React.useRef(null);
            const closeHandlerRef = React.useRef(onClose);
            closeHandlerRef.current = onClose;
            useEffect(() => {
                if (!isOpen) return undefined;
                const previousFocus = document.activeElement;
                const focusable = () => Array.from(dialogRef.current?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []).filter((item) => item.getClientRects().length > 0);
                focusable()[0]?.focus();
                const handleDialogKeys = (event) => {
                    if (event.key === 'Escape') { closeHandlerRef.current?.(); return; }
                    if (event.key !== 'Tab') return;
                    const items = focusable();
                    if (!items.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
                    const first = items[0]; const last = items[items.length - 1];
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
                };
                window.addEventListener('keydown', handleDialogKeys);
                return () => { window.removeEventListener('keydown', handleDialogKeys); previousFocus?.focus?.(); };
            }, [isOpen]);
            if (!isOpen) return null;
            const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl', full: 'max-w-full mx-4' };
            return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
                    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={modalTitleId} className={'bg-white rounded-2xl shadow-2xl w-full ' + sizes[size] + ' max-h-[90vh] overflow-hidden animate-fade-in'} onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 id={modalTitleId} className="text-lg font-semibold text-slate-900">{title}</h3>
                            <button type="button" onClick={onClose} aria-label="Close dialog" className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
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
                <div className="flex gap-1" role="tablist" aria-label="Page sections">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onChange(tab.id)}
                            role="tab"
                            aria-selected={activeTab === tab.id}
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
                    <table className="data-table w-full">
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
                                        <td key={col.key} data-label={col.title} className={'px-4 py-3 text-sm text-slate-700 ' + (col.className || '')}>
                                            {col.render ? col.render(row, idx) : row[col.key]}
                                        </td>
                                    ))}
                                    {actions && (
                                        <td data-label="Actions" className="px-4 py-3 text-right">
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
                <Card className="hover-lift luxury-stat-card">
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

        const SearchBar = ({ value, onChange, placeholder = 'Search...', className = '', ariaLabel = 'Search records' }) => (
            <div className={'relative ' + className}>
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Icons.Search size={18} />
                </div>
                <input
                    type="text"
                    aria-label={ariaLabel}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:border-medical-500 focus:ring-2 focus:ring-medical-200 focus:ring-opacity-50 outline-none transition-all text-sm"
                />
                {value && (
                        <button type="button" onClick={() => onChange({ target: { value: '' } })} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
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
                <div role={type === 'error' ? 'alert' : 'status'} aria-live={type === 'error' ? 'assertive' : 'polite'} className={'fixed bottom-4 right-4 ' + colors[type] + ' text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 toast z-50'}>
                    {type === 'success' && <Icons.CheckCircle size={20} />}
                    {type === 'error' && <Icons.AlertCircle size={20} />}
                    <span className="text-sm font-medium">{message}</span>
                    <button type="button" onClick={onClose} aria-label="Dismiss notification" className="ml-2 hover:opacity-80"><Icons.X size={16} /></button>
                </div>
            );
        };

        // ==========================================
        // CHART COMPONENTS
        // ==========================================
        const LineChart = ({ data, width = 400, height = 200, color = '#2563eb' }) => {
            const safeData = Array.isArray(data) ? data.filter((d) => d && Number.isFinite(Number(d.value))) : [];
            if (safeData.length === 0) return null;

            const padding = 20;
            const chartWidth = width - padding * 2;
            const chartHeight = height - padding * 2;
            const values = safeData.map(d => Number(d.value));
            const maxValue = Math.max(...values, 0);
            const minValue = Math.min(...values, 0);
            const range = maxValue - minValue || 1;

            const points = safeData.map((d, i) => {
                const value = Number(d.value) || 0;
                const x = padding + (safeData.length > 1 ? (i / (safeData.length - 1)) : 0.5) * chartWidth;
                const y = padding + chartHeight - ((value - minValue) / range) * chartHeight;
                return `${x},${y}`;
            }).join(' ');

            const areaPoints = `${padding},${height} ${points} ${width - padding},${height}`;

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
                    {safeData.map((d, i) => {
                        const value = Number(d.value) || 0;
                        const x = padding + (safeData.length > 1 ? (i / (safeData.length - 1)) : 0.5) * chartWidth;
                        const y = padding + chartHeight - ((value - minValue) / range) * chartHeight;
                        return <circle key={i} cx={x} cy={y} r="4" fill="white" stroke={color} strokeWidth="2" />;
                    })}
                </svg>
            );
        };

        const BarChart = ({ data, width = 400, height = 200, color = '#2563eb' }) => {
            const safeData = Array.isArray(data) ? data.filter((d) => d && Number.isFinite(Number(d.value))) : [];
            if (safeData.length === 0) return null;

            const padding = 30;
            const barWidth = Math.max(12, (width - padding * 2) / safeData.length - 8);
            const maxValue = Math.max(...safeData.map(d => Number(d.value) || 0), 1);

            return (
                <svg width={width} height={height} className="overflow-visible">
                    {safeData.map((d, i) => {
                        const value = Number(d.value) || 0;
                        const barHeight = maxValue > 0 ? (value / maxValue) * (height - padding * 2) : 0;
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
            const safeValue = Number(value) || 0;
            const safeMax = Number(max) || 100;
            const normalizedValue = safeMax > 0 ? Math.min(100, Math.max(0, (safeValue / safeMax) * 100)) : 0;
            const radius = (size - strokeWidth) / 2;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (normalizedValue / 100) * circumference;

            return (
                <div className="relative inline-flex items-center justify-center">
                    <svg width={size} height={size} className="progress-ring">
                        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
                        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="progress-ring-circle" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-bold text-slate-900">{Math.round(normalizedValue)}%</span>
                        {label && <span className="text-xs text-slate-500">{label}</span>}
                    </div>
                </div>
            );
        };
