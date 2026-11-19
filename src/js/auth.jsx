        // ==========================================
        // AUTH CONTEXT
        // ==========================================
        const AuthContext = React.createContext(null);
        const aal2RequiredRoles = ['super_admin', 'accountant', 'doctor', 'pharmacist', 'surgeon', 'specialist'];
        const MFA_TRUST_WINDOW_MS = 24 * 60 * 60 * 1000;
        const hasRecentTotpVerification = (assurance) => {
            if (assurance?.currentLevel !== 'aal2') return false;
            const latestTotp = (assurance.currentAuthenticationMethods || [])
                .filter((entry) => entry?.method === 'totp')
                .map((entry) => Number(entry.timestamp) * 1000)
                .filter((timestamp) => Number.isFinite(timestamp) && timestamp <= Date.now() + 60_000)
                .sort((left, right) => right - left)[0];
            return Number.isFinite(latestTotp) && Date.now() - latestTotp < MFA_TRUST_WINDOW_MS;
        };
        const canonicalModuleKeys = [
            'dashboard', 'patients', 'records', 'appointments', 'doctors', 'laboratory', 'radiology', 'clinical_workflows',
            'clinical_decision_support', 'operations', 'procurement', 'referrals', 'workforce', 'pharmacy', 'billing', 'insurance', 'payments', 'documents', 'compliance', 'admissions', 'surgeries', 'clinical_safety', 'inventory',
            'nursing', 'blood_bank', 'hr', 'offices', 'organization', 'reports', 'audit', 'settings', 'vital_registry', 'staff_leave', 'incident_safety'
        ];

        const legacyPermissionAliases = {
            appointments: ['appointment'],
            records: ['record_management', 'medical_records'],
            doctors: ['doctor'],
            laboratory: ['labs', 'lab', 'lab_orders'],
            radiology: ['imaging'],
            clinical_workflows: ['encounters', 'immunizations', 'medication_administrations', 'mar'],
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
            blood_bank: ['bloodbank'],
            inventory: ['stock'],
            hr: ['staff', 'human_resources'],
            offices: ['medical_offices', 'office'],
            reports: ['report'],
            audit: ['audit_logs'],
            settings: ['system_settings']
        };

        // Role-menu shortcuts route into a tab or workflow owned by these modules.
        // Their authorization must be checked against that owning module.
        const routeModulePermissions = {
            blood_bank: ['laboratory', 'clinical_safety'],
            consultations: ['patients', 'clinical_decision_support'],
            ward: ['admissions', 'operations'],
            vitals: ['clinical_decision_support', 'patients'],
            medications: ['pharmacy', 'admissions'],
            prescriptions: ['pharmacy', 'clinical_decision_support'],
            results: ['laboratory'],
            upload: ['radiology'],
            lab_results: ['portal'],
            messages: ['portal']
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

                // Saved role matrices may predate this clinical module. Apply the
                // clinician default only when an administrator has not set it.
                const roleKey = String(row?.role || '').trim().toLowerCase().replace(/\s+/g, '_');
                if (roleKey === 'receptionist') {
                    canonicalModuleKeys.forEach((key) => {
                        const allowed = ['dashboard', 'patients', 'appointments', 'clinical_workflows'].includes(key);
                        permissions[key] = allowed;
                        (legacyPermissionAliases[key] || []).forEach((alias) => { permissions[alias] = allowed; });
                    });
                }
                if (permissions.clinical_workflows === undefined && ['super_admin', 'doctor', 'nurse'].includes(roleKey)) {
                    permissions.clinical_workflows = true;
                }
                if (roleKey === 'records_officer' || roleKey === 'health_information_management_officer') {
                    if (permissions.dashboard === undefined) permissions.dashboard = true;
                    if (permissions.records === undefined) permissions.records = true;
                }

                // Older matrices did not include every department. Preserve an
                // administrator's explicit choices, while giving legacy Super
                // Admin rows access to newly introduced departments by default.
                if (roleKey === 'super_admin') {
                    canonicalModuleKeys.forEach((key) => {
                        if (permissions[key] === undefined) permissions[key] = true;
                    });
                }
                if (roleKey === 'nurse' && permissions.nursing === undefined) permissions.nursing = true;

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
                    records: true,
                    appointments: true,
                    doctors: true,
                    laboratory: true,
                    radiology: true,
                    clinical_workflows: true,
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
                    nursing: true,
                    surgeries: true,
                    clinical_safety: true,
                    inventory: true,
                    hr: true,
                    offices: true,
                    organization: true,
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
                    clinical_workflows: true,
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
                role: 'Nurse',
                permissions: {
                    dashboard: true,
                    patients: true,
                    appointments: false,
                    doctors: false,
                    laboratory: false,
                    radiology: false,
                    clinical_workflows: true,
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
                    nursing: true,
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
                    clinical_workflows: false,
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
                    referrals: false,
                    workforce: false,
                    pharmacy: false,
                    billing: false,
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
            },
            {
                role: 'Health Information Management Officer',
                permissions: {
                    dashboard: true,
                    records: true,
                    patients: true,
                    clinical_workflows: true
                }
            },
            {
                role: 'Surgeon',
                permissions: { dashboard: true, patients: true, clinical_workflows: true, surgeries: true, clinical_safety: true }
            },
            {
                role: 'Specialist',
                permissions: { dashboard: true, patients: true, appointments: true, consultations: true, laboratory: true, radiology: true, clinical_workflows: true, prescriptions: true, clinical_safety: true }
            },
            {
                role: 'Theatre Staff',
                permissions: { dashboard: true, surgeries: true }
            }
        ];

        const AuthProvider = ({ children }) => {
            const [user, setUser] = useState(null);
            const [roleMatrix, setRoleMatrix] = useState(defaultRoleMatrix);
            const [loading, setLoading] = useState(false);
            const [mfaGate, setMfaGate] = useState(null);
            const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(() => {
                const query = new URLSearchParams(window.location.search);
                const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                return globalThis.__ONEMED_AUTH_LINK_TYPE__ === 'recovery'
                    || query.get('type') === 'recovery' || hash.get('type') === 'recovery';
            });
            const [sessionSecurity, setSessionSecurity] = useState({ timeoutMinutes: 30, autoLogoutIdle: true });

            const requiresMfa = useCallback(async (profile, client) => {
                const role = String(profile?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
                if (!aal2RequiredRoles.includes(role)) return false;
                const { data, error } = await client.from('system_settings').select('setting_value').eq('setting_key', 'mfa_enforcement').maybeSingle();
                if (error) return true;
                return data?.setting_value?.enabled !== false;
            }, []);

            const setMfaChallenge = useCallback(async (profile, client) => {
                let factor = null;
                let factorError = null;
                try {
                    const { data, error } = await client.auth.mfa.listFactors();
                    factorError = error;
                    factor = (data?.totp || []).find((entry) => entry.status === 'verified') || null;
                } catch (error) {
                    factorError = error;
                }
                setMfaGate({
                    profile,
                    mode: factor ? 'challenge' : 'enroll',
                    factorId: factor?.id || null,
                    qrCode: null,
                    secret: null,
                    error: factorError ? 'Authenticator status is unavailable. Retry setup or contact an administrator.' : ''
                });
            }, []);

            const beginMfaEnrollment = useCallback(async () => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client || !mfaGate?.profile) throw new Error('Authenticator setup is unavailable. Sign in again.');
                const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'OneMed authenticator' });
                if (error || !data?.id || !data?.totp?.qr_code) throw error || new Error('Could not start authenticator setup.');
                setMfaGate((current) => current ? { ...current, mode: 'enroll', factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, error: '' } : current);
            }, [mfaGate]);

            const verifyMfa = useCallback(async (code) => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client || !mfaGate?.factorId || !mfaGate?.profile) throw new Error('Authenticator verification is not ready.');
                const normalizedCode = String(code || '').replace(/\s/g, '');
                if (!/^\d{6,8}$/.test(normalizedCode)) throw new Error('Enter the current code from your authenticator app.');
                const { error } = await client.auth.mfa.challengeAndVerify({ factorId: mfaGate.factorId, code: normalizedCode });
                if (error) throw new Error('The authenticator code could not be verified. Check the code and try again.');
                const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
                if (assuranceError || !hasRecentTotpVerification(assurance)) throw new Error('Recent authenticator verification could not be confirmed. Sign in again and retry.');
                const profile = mfaGate.profile;
                const safeUser = {
                    ...profile,
                    name: String(profile.name || profile.full_name || profile.email || '').trim() || 'User',
                    role: String(profile.role || 'receptionist').trim().toLowerCase().replace(/[\s-]+/g, '_'),
                    patientId: profile.patientId || profile.patient_id || null
                };
                delete safeUser.password;
                setMfaGate(null);
                setUser(safeUser);
                return safeUser;
            }, [mfaGate]);

            const cancelMfa = useCallback(async () => {
                const client = window.OneMedSupabase?.getClient?.();
                setMfaGate(null);
                setUser(null);
                if (client) await client.auth.signOut();
            }, []);

            const gateForMfa = useCallback(async (profile) => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client || !await requiresMfa(profile, client)) return false;
                const { data: assurance, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
                if (!error && hasRecentTotpVerification(assurance)) return false;
                await setMfaChallenge(profile, client);
                setUser(null);
                return true;
            }, [requiresMfa, setMfaChallenge]);

            // Re-prompt when the last TOTP verification reaches 24 hours, even
            // if the browser's Supabase session remains active.
            useEffect(() => {
                if (!user?.auth_user_id || mfaGate) return undefined;
                const role = String(user.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
                if (!aal2RequiredRoles.includes(role)) return undefined;
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return undefined;
                let timer;
                let active = true;
                const checkMfaExpiry = async () => {
                    if (!await requiresMfa(user, client)) return;
                    const { data: assurance, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
                    if (!active) return;
                    if (error || !hasRecentTotpVerification(assurance)) {
                        await setMfaChallenge(user, client);
                        if (active) setUser(null);
                        return;
                    }
                    const latestTotp = Math.max(...(assurance.currentAuthenticationMethods || [])
                        .filter((entry) => entry?.method === 'totp')
                        .map((entry) => Number(entry.timestamp) * 1000)
                        .filter(Number.isFinite));
                    const delay = Math.max(0, latestTotp + MFA_TRUST_WINDOW_MS - Date.now() + 250);
                    timer = window.setTimeout(checkMfaExpiry, Math.min(delay, 2_147_000_000));
                };
                void checkMfaExpiry();
                return () => { active = false; window.clearTimeout(timer); };
            }, [user, mfaGate, requiresMfa, setMfaChallenge]);

            useEffect(() => {
                if (!user?.id) return undefined;
                let active = true;
                const applySettings = (settings) => {
                    if (!settings || typeof settings !== 'object') return;
                    const configuredTimezone = String(settings.timezone || 'Africa/Lagos');
                    try {
                        new Intl.DateTimeFormat('en', { timeZone: configuredTimezone }).format(new Date());
                        window.OneMedFacilityTimezone = configuredTimezone;
                    } catch (error) {
                        window.OneMedFacilityTimezone = 'Africa/Lagos';
                    }
                    setSessionSecurity({
                        timeoutMinutes: 30,
                        autoLogoutIdle: true
                    });
                };
                const loadSettings = async () => {
                    try {
                        const settings = await window.OneMedSupabase?.loadSystemSettings?.();
                        if (active) applySettings(settings);
                    } catch (error) {
                        console.warn('Session security settings unavailable; using the 30-minute default.');
                    }
                };
                const handleSettingsUpdate = (event) => applySettings(event.detail);
                window.addEventListener('onemed:session-settings-updated', handleSettingsUpdate);
                loadSettings();
                return () => {
                    active = false;
                    window.removeEventListener('onemed:session-settings-updated', handleSettingsUpdate);
                };
            }, [user?.id]);

            useEffect(() => {
                if (!user?.id || !sessionSecurity.autoLogoutIdle) return undefined;
                const timeoutMs = sessionSecurity.timeoutMinutes * 60 * 1000;
                let warningTimer;
                let logoutTimer;
                let lastBroadcastAt = 0;
                let expired = false;
                let lastActivityAt = Date.now();
                const activityChannel = 'BroadcastChannel' in window ? new BroadcastChannel('onemed-session-activity') : null;
                const clearTimers = () => {
                    window.clearTimeout(warningTimer);
                    window.clearTimeout(logoutTimer);
                };
                const expireSession = async () => {
                    if (expired) return;
                    expired = true;
                    clearTimers();
                    window.dispatchEvent(new CustomEvent('onemed:session-expired'));
                    setUser(null);
                    try { await window.OneMedSupabase?.logout?.(); } catch (error) {
                        console.warn('Supabase sign-out could not be confirmed after inactivity.');
                    }
                };
                const schedule = () => {
                    clearTimers();
                    const remaining = Math.max(0, timeoutMs - (Date.now() - lastActivityAt));
                    warningTimer = window.setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('onemed:session-expiring', {
                            detail: { secondsRemaining: Math.ceil(Math.min(60000, timeoutMs) / 1000) }
                        }));
                    }, Math.max(0, remaining - Math.min(60000, timeoutMs)));
                    logoutTimer = window.setTimeout(expireSession, remaining);
                };
                const recordActivity = () => {
                    lastActivityAt = Date.now();
                    if (lastActivityAt - lastBroadcastAt >= 5000) {
                        activityChannel?.postMessage({ userId: user.id, activityAt: lastActivityAt });
                        lastBroadcastAt = lastActivityAt;
                    }
                    schedule();
                };
                const syncOtherTabActivity = (event) => {
                    if (event.data?.userId !== user.id) return;
                    const sharedActivityAt = Number(event.data.activityAt);
                    if (Number.isFinite(sharedActivityAt) && sharedActivityAt > lastActivityAt) {
                        lastActivityAt = sharedActivityAt;
                        schedule();
                    }
                };
                const checkOnReturn = () => {
                    if (document.visibilityState === 'visible') {
                        if (Date.now() - lastActivityAt >= timeoutMs) expireSession();
                        else schedule();
                    }
                };
                const events = ['keydown', 'pointerdown', 'touchstart', 'scroll'];
                events.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
                document.addEventListener('visibilitychange', checkOnReturn);
                activityChannel?.addEventListener('message', syncOtherTabActivity);
                schedule();
                return () => {
                    clearTimers();
                    events.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
                    document.removeEventListener('visibilitychange', checkOnReturn);
                    activityChannel?.removeEventListener('message', syncOtherTabActivity);
                    activityChannel?.close();
                };
            }, [user?.id, sessionSecurity]);

            useEffect(() => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) return undefined;
                let active = true;
                let sessionRevision = 0;
                const clearSignedOutState = () => {
                    initializeEmptyStore();
                    setMfaGate(null);
                    setUser(null);
                };
                const applySession = async (session) => {
                    if (!active) return;
                    const revision = ++sessionRevision;
                    if (!session?.user) {
                        clearSignedOutState();
                        return;
                    }
                    if (passwordRecoveryPending) {
                        setUser(null);
                        return;
                    }
                    const { data, error } = await client.from('profiles').select('*').eq('auth_user_id', session.user.id).maybeSingle();
                    if (!active || revision !== sessionRevision) return;
                    // A transient Data API/network failure is not proof that an
                    // account was deactivated. Keep the Supabase session (and
                    // any user already established by the login flow) intact;
                    // the next auth event or reload can retry this lookup.
                    if (error) {
                        console.warn('Could not refresh the signed-in profile; keeping the current auth session.');
                        return;
                    }
                    // An Auth session alone is not sufficient to use the EMR.
                    // Deactivated accounts must not enter the UI until RLS rejects
                    // their first request.
                    if (data?.status !== 'active') {
                        await client.auth.signOut();
                        if (active && revision === sessionRevision) clearSignedOutState();
                        return;
                    }
                    if (data) {
                        if (await requiresMfa(data, client)) {
                            const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
                            if (!active || revision !== sessionRevision) return;
                            if (assuranceError || !hasRecentTotpVerification(assurance)) {
                                await setMfaChallenge(data, client);
                                if (active && revision === sessionRevision) setUser(null);
                                return;
                            }
                        }
                        if (active && revision === sessionRevision) setMfaGate(null);
                        setUser({
                            ...data,
                            name: String(data.full_name || data.name || data.email || '').trim() || 'User',
                            role: String(data.role || 'receptionist').trim().toLowerCase().replace(/[\s-]+/g, '_'),
                            patientId: data.patient_id || null
                        });
                    }
                };
                client.auth.getSession().then(({ data }) => applySession(data.session));
                const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
                    if (event === 'PASSWORD_RECOVERY') {
                        setPasswordRecoveryPending(true);
                        setUser(null);
                        return;
                    }
                    if (!session?.user) {
                        sessionRevision += 1;
                        clearSignedOutState();
                        return;
                    }
                    // Supabase awaits auth-state callbacks while holding its
                    // auth lock. Defer profile/MFA requests until after this
                    // synchronous callback returns to avoid deadlocking sign-in.
                    window.setTimeout(() => {
                        if (active) void applySession(session);
                    }, 0);
                });
                return () => { active = false; subscription.subscription.unsubscribe(); };
            }, [requiresMfa, setMfaChallenge, passwordRecoveryPending]);

            const completePasswordRecovery = useCallback(async (profile) => {
                setPasswordRecoveryPending(false);
                if (await gateForMfa(profile)) return false;
                setMfaGate(null);
                setUser({
                    ...profile,
                    name: String(profile.full_name || profile.name || profile.email || '').trim() || 'User',
                    role: String(profile.role || 'receptionist').trim().toLowerCase().replace(/[\s-]+/g, '_'),
                    patientId: profile.patient_id || null
                });
                return true;
            }, [gateForMfa]);

            useEffect(() => {
                const hydrateRoleMatrix = async () => {
                    try {
                        if (window.OneMedSupabase && typeof window.OneMedSupabase.loadSystemSettings === 'function') {
                            const remoteSettings = await window.OneMedSupabase.loadSystemSettings();
                            const remoteMatrix = Array.isArray(remoteSettings.roleMatrix) ? remoteSettings.roleMatrix : [];
                            if (remoteMatrix.length) {
                                const normalizedRemote = normalizeRoleMatrix(remoteMatrix);
                                setRoleMatrix(normalizedRemote);
                            }
                        }
                    } catch (e) {
                        console.warn('Role matrix hydration unavailable:', e);
                    }
                };

                hydrateRoleMatrix();
            }, []);

            useEffect(() => {
                const refreshAccessPolicy = (event) => {
                    const matrix = event?.detail?.roleMatrix;
                    if (Array.isArray(matrix) && matrix.length) {
                        setRoleMatrix(normalizeRoleMatrix(matrix));
                    }
                };
                window.addEventListener('onemed:access-policy-updated', refreshAccessPolicy);
                return () => window.removeEventListener('onemed:access-policy-updated', refreshAccessPolicy);
            }, []);

            const login = useCallback(async (email, password, captchaToken = '') => {
                setLoading(true);
                try {
                    let found = null;
                    const normalizedEmail = String(email || '').trim();
                    const normalizedPassword = String(password || '');

                    if (window.OneMedSupabase && typeof window.OneMedSupabase.loginProfile === 'function') {
                        found = await window.OneMedSupabase.loginProfile(normalizedEmail, normalizedPassword, captchaToken);
                    }

                    if (found) {
                        const safeUser = {
                            ...found,
                            id: found.id,
                            name: String(found.name || found.full_name || found.email || '').trim() || 'User',
                            role: String(found.role || 'receptionist').trim().toLowerCase().replace(/[\s-]+/g, '_'),
                            email: found.email,
                            patientId: found.patientId || null
                        };
                        delete safeUser.password;
                        const client = window.OneMedSupabase?.getClient?.();
                        if (!client) throw new Error('Authentication is unavailable.');
                        if (await requiresMfa(safeUser, client)) {
                            const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
                            if (assuranceError || !hasRecentTotpVerification(assurance)) {
                                setUser(null);
                                await setMfaChallenge(safeUser, client);
                                return { mfaRequired: true };
                            }
                        }
                        setMfaGate(null);
                        setUser(safeUser);
                        return safeUser;
                    }
                    throw new Error('Authentication is unavailable. Check the connection and try again.');
                } finally {
                    setLoading(false);
                }
            }, [requiresMfa, setMfaChallenge]);

            const logout = useCallback(() => {
                setMfaGate(null);
                setUser(null);
                window.OneMedSupabase?.logout?.();
            }, []);

            const normalizeRoleKey = (role) => {
                const key = String(role || 'patient').trim().toLowerCase().replace(/\s+/g, '_');
                return key === 'health_information_management_officer' ? 'records_officer' : key;
            };

            const getStoredRoleMatrix = () => normalizeRoleMatrix(roleMatrix);

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
                    receptionist: ['view_patient', 'schedule_appointment', 'refer_to_records'],
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
                // This control is deliberately evaluated here (rather than only in
                // navigation) so direct navigation is governed by the same policy.
                const normalizedRole = normalizeRoleKey(user.role);
                if (moduleId === 'vital_registry') return ['super_admin', 'records_officer', 'doctor'].includes(normalizedRole);
                if (moduleId === 'hr') return ['super_admin', 'hr_officer'].includes(normalizedRole);
                if (moduleId === 'staff_leave') return ['super_admin', 'hr_officer', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'laboratory_scientist', 'radiographer', 'accountant', 'records_officer', 'surgeon', 'specialist', 'theatre_staff', 'maintenance_officer', 'safety_officer'].includes(normalizedRole);
                if (moduleId === 'incident_safety') return ['super_admin', 'safety_officer', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'laboratory_scientist', 'radiographer', 'accountant', 'records_officer', 'surgeon', 'specialist', 'theatre_staff', 'maintenance_officer', 'hr_officer'].includes(normalizedRole);
                if (normalizedRole === 'receptionist') return ['dashboard', 'patients', 'appointments', 'clinical_workflows'].includes(moduleId);
                const matrix = getStoredRoleMatrix();
                const match = matrix.find(row => normalizeRoleKey(row.role) === normalizedRole);
                if (match && match.permissions) {
                    const permissions = match.permissions || {};
                    const permissionKeys = [moduleId, ...(legacyPermissionAliases[moduleId] || []), ...(routeModulePermissions[moduleId] || [])];
                    return permissionKeys.some((key) => permissions[key] === true);
                }

                const fallback = {
                    super_admin: ['dashboard', 'patients', 'records', 'appointments', 'doctors', 'laboratory', 'radiology', 'clinical_workflows', 'pharmacy', 'billing', 'admissions', 'nursing', 'surgeries', 'clinical_safety', 'blood_bank', 'inventory', 'hr', 'offices', 'organization', 'reports', 'audit', 'settings'],
                    doctor: ['dashboard', 'patients', 'appointments', 'consultations', 'laboratory', 'radiology', 'clinical_workflows', 'prescriptions', 'admissions', 'clinical_safety', 'blood_bank'],
                    nurse: ['dashboard', 'patients', 'ward', 'nursing', 'vitals', 'medications', 'clinical_workflows', 'clinical_safety', 'blood_bank'],
                    receptionist: ['dashboard', 'patients', 'appointments'],
                    records_officer: ['dashboard', 'records'],
                    surgeon: ['dashboard', 'patients', 'clinical_workflows', 'surgeries', 'clinical_safety'],
                    specialist: ['dashboard', 'patients', 'appointments', 'consultations', 'laboratory', 'radiology', 'clinical_workflows', 'prescriptions', 'clinical_safety'],
                    theatre_staff: ['dashboard', 'surgeries'],
                    pharmacist: ['dashboard', 'pharmacy', 'inventory', 'prescriptions'],
                    laboratory_scientist: ['dashboard', 'laboratory', 'results', 'blood_bank'],
                    radiographer: ['dashboard', 'radiology', 'upload'],
                    accountant: ['dashboard', 'billing', 'reports'],
                    patient: ['dashboard', 'portal', 'appointments', 'lab_results', 'prescriptions', 'billing', 'messages']
                };
                return (fallback[normalizedRole] || []).includes(moduleId);
            }, [user, roleMatrix]);

            return (
            <AuthContext.Provider value={{ user, login, logout, loading, mfaGate, passwordRecoveryPending, completePasswordRecovery, beginMfaEnrollment, verifyMfa, cancelMfa, gateForMfa, hasPermission, hasModuleAccess, getRolePermissions }}>
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
            const [confirmPassword, setConfirmPassword] = useState('');
            const [error, setError] = useState('');
            const [inviteLinkError, setInviteLinkError] = useState(() => {
                const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                const code = hashParams.get('error_code');
                return code === 'otp_expired'
                    ? 'This OneMed email link has expired or was already used. Ask your Super Admin for a fresh invitation or password reset email.'
                    : '';
            });
            const [inviteMode, setInviteMode] = useState(() => {
                const params = new URLSearchParams(window.location.search);
                const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                return globalThis.__ONEMED_AUTH_LINK_TYPE__ === 'invite'
                    || params.get('type') === 'invite' || hashParams.get('type') === 'invite' || hashParams.get('error_code') === 'otp_expired';
            });
            const [recoveryMode, setRecoveryMode] = useState(() => {
                const params = new URLSearchParams(window.location.search);
                const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                return globalThis.__ONEMED_AUTH_LINK_TYPE__ === 'recovery'
                    || params.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
            });
            const [inviteSessionReady, setInviteSessionReady] = useState(false);
            const [inviteSessionChecked, setInviteSessionChecked] = useState(false);
            const [invitePasswordBusy, setInvitePasswordBusy] = useState(false);
            const [showPassword, setShowPassword] = useState(false);
            const { login, logout, loading, mfaGate, passwordRecoveryPending, beginMfaEnrollment, verifyMfa, cancelMfa, gateForMfa, completePasswordRecovery } = useAuth();
            const passwordSetupMode = inviteMode || recoveryMode || passwordRecoveryPending;
            const [mfaCode, setMfaCode] = useState('');
            const [mfaBusy, setMfaBusy] = useState(false);
            const [captchaToken, setCaptchaToken] = useState('');
            const [captchaError, setCaptchaError] = useState('');
            const [noticeAccepted, setNoticeAccepted] = useState(false);
            const captchaWidgetId = useRef(null);

            useEffect(() => {
                if (passwordRecoveryPending) setRecoveryMode(true);
            }, [passwordRecoveryPending]);

            useEffect(() => {
                if (!passwordSetupMode) return undefined;
                if (inviteLinkError) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                    return undefined;
                }
                let active = true;
                const checkInviteSession = async () => {
                    const client = window.OneMedSupabase?.getClient?.();
                    if (!client) {
                        if (active) {
                            setError('Account setup is unavailable. Refresh this invitation page or contact your administrator.');
                            setInviteSessionChecked(true);
                        }
                        return;
                    }
                    const { data, error: sessionError } = await client.auth.getSession();
                    if (!active) return;
                    setInviteSessionChecked(true);
                    if (sessionError || !data?.session?.user) {
                        const message = recoveryMode
                            ? 'This password reset link is invalid or expired. Ask your administrator to send another reset email.'
                            : 'This invitation link is invalid or expired. Ask your administrator to send a new invitation.';
                        setInviteLinkError(message);
                        setError(message);
                        return;
                    }
                    setInviteSessionReady(true);
                    setEmail(data.session.user.email || '');
                };
                void checkInviteSession();
                return () => { active = false; };
            }, [passwordSetupMode, recoveryMode, inviteLinkError]);

            const handleInvitePassword = async (event) => {
                event.preventDefault();
                setError('');
                if (!recoveryMode && !noticeAccepted) {
                    setError('Review and acknowledge the draft privacy notice and terms to continue.');
                    return;
                }
                if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
                    setError('Use at least 12 characters with lowercase and uppercase letters, a number, and a symbol.');
                    return;
                }
                if (password !== confirmPassword) {
                    setError('The passwords do not match.');
                    return;
                }
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) {
                    setError('Account setup is unavailable. Refresh this page or contact your administrator.');
                    return;
                }
                setInvitePasswordBusy(true);
                try {
                    const { data: sessionData, error: sessionError } = await client.auth.getSession();
                    if (sessionError || !sessionData?.session?.user) throw new Error(recoveryMode
                        ? 'This password reset link is invalid or expired. Ask your administrator to send another reset email.'
                        : 'This invitation link is invalid or expired. Ask your administrator to send a new invitation.');
                    const { error: updateError } = await client.auth.updateUser({ password });
                    if (updateError) throw updateError;
                    const { data: profile, error: profileError } = await client.from('profiles').select('*').eq('auth_user_id', sessionData.session.user.id).maybeSingle();
                    if (profileError || !profile || profile.status !== 'active') throw new Error('Your account could not be verified. Contact your administrator.');
                    setInviteMode(false);
                    setRecoveryMode(false);
                    globalThis.__ONEMED_AUTH_LINK_TYPE__ = '';
                    window.history.replaceState({}, document.title, window.location.pathname);
                    setPassword('');
                    setConfirmPassword('');
                    if (recoveryMode) {
                        if (await completePasswordRecovery(profile)) onLogin();
                        return;
                    }
                    // Clinician roles must finish the same MFA gate as a normal
                    // sign-in before the app marks this session authenticated.
                    if (await gateForMfa(profile)) return;
                    await recordNoticeAcceptance();
                    onLogin();
                } catch (inviteError) {
                    setError(inviteError?.message || 'Your password could not be saved. Try again or request a new invitation.');
                } finally {
                    setInvitePasswordBusy(false);
                }
            };

            const recordNoticeAcceptance = async () => {
                const client = window.OneMedSupabase?.getClient?.();
                if (!client) throw new Error('Privacy acceptance could not be recorded because the service is unavailable.');
                const { error: acceptanceError } = await client.rpc('record_privacy_notice_acceptance', {
                    p_privacy_version: 'draft-2026-11-12-v1', p_terms_version: 'draft-2026-11-12-v1'
                });
                if (acceptanceError) throw new Error(`Privacy acceptance could not be recorded. ${acceptanceError.message || ''}`.trim());
            };

            useEffect(() => {
                if (mfaGate) return undefined;
                const siteKey = String(window.__ONEMED_CAPTCHA_SITE_KEY__ || '').trim();
                if (!siteKey) {
                    setCaptchaError('Turnstile site key is not configured. Contact the system administrator.');
                    return undefined;
                }
                setCaptchaError('');
                let widgetId = null;
                let attempts = 0;
                let timer;
                const renderWidget = () => {
                    if (widgetId) return;
                    const element = document.getElementById('onemed-turnstile-widget');
                    if (!window.turnstile || !element) {
                        attempts += 1;
                        if (attempts >= 50) setCaptchaError('Turnstile could not load. Try again later.');
                        return;
                    }
                    widgetId = window.turnstile.render(element, {
                        sitekey: siteKey,
                        callback: (token) => { setCaptchaToken(token); setCaptchaError(''); },
                        'expired-callback': () => setCaptchaToken(''),
                        'error-callback': (errorCode) => {
                            setCaptchaToken('');
                            const code = String(errorCode || '').trim();
                            const message = code === '110200' || code === '400021'
                                ? 'This site is not authorized for the Turnstile key. Add medicore-pi-seven.vercel.app to that key’s allowed hostnames.'
                                : ['110100', '110110', '400020', '400070'].includes(code)
                                    ? `The Turnstile site key is invalid or disabled${code ? ` (code ${code})` : ''}. Check the Production VITE_TURNSTILE_SITE_KEY.`
                                    : code === '200500'
                                        ? 'The Turnstile challenge could not load. Check browser extensions, network access, and the Content Security Policy for challenges.cloudflare.com.'
                                        : `Turnstile verification failed${code ? ` (code ${code})` : ''}. Check the site key, allowed hostname, and network access, then refresh.`;
                            setCaptchaError(message);
                            return true;
                        }
                    });
                    captchaWidgetId.current = widgetId;
                    if (timer) window.clearInterval(timer);
                };
                timer = window.setInterval(renderWidget, 100);
                renderWidget();
                return () => {
                    window.clearInterval(timer);
                    setCaptchaToken('');
                    if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
                    captchaWidgetId.current = null;
                };
            }, [mfaGate]);

            const handleSubmit = async (e) => {
                e.preventDefault();
                setError('');
                try {
                    if (mfaGate) {
                        if (!noticeAccepted) throw new Error('Review and acknowledge the draft privacy notice and terms to continue.');
                        setMfaBusy(true);
                        await verifyMfa(mfaCode);
                        await recordNoticeAcceptance();
                        onLogin();
                        return;
                    }
                    if (!noticeAccepted) throw new Error('Review and acknowledge the draft privacy notice and terms to continue.');
                    if (!captchaToken) {
                        const captchaRequired = new Error(captchaError || 'Complete the CAPTCHA check before signing in.');
                        captchaRequired.code = 'CAPTCHA_REQUIRED';
                        throw captchaRequired;
                    }
                    const result = await login(email, password, captchaToken);
                    if (!result?.mfaRequired) {
                        await recordNoticeAcceptance();
                        onLogin();
                    }
                } catch (err) {
                    if (String(err?.message || '').startsWith('Privacy acceptance could not be recorded')) logout();
                    const message = String(err?.message || '');
                    const authMessage = /captcha|turnstile/i.test(message)
                        ? 'Security verification was rejected. Complete the CAPTCHA again; if it repeats, the administrator needs to check the Turnstile and Supabase CAPTCHA configuration.'
                        : /network|fetch|timeout|unavailable/i.test(message)
                            ? 'The sign-in service could not be reached. Check your connection and try again.'
                            : /staff profile|account is not active|no linked staff profile/i.test(message)
                                ? message
                                : 'Invalid email or password. Contact your administrator if you need an account.';
                    setError(err?.code === 'CAPTCHA_REQUIRED' ? err.message : err?.message?.includes('privacy') || err?.message?.includes('Privacy') || mfaGate ? (err?.message || 'Authenticator verification failed.') : authMessage);
                    if (!mfaGate && captchaWidgetId.current && window.turnstile) {
                        window.turnstile.reset(captchaWidgetId.current);
                        setCaptchaToken('');
                    }
                } finally {
                    setMfaBusy(false);
                }
            };

            const handleBeginMfaEnrollment = async () => {
                setError('');
                setMfaBusy(true);
                try { await beginMfaEnrollment(); }
                catch (err) { setError(err?.message || 'Authenticator setup could not start.'); }
                finally { setMfaBusy(false); }
            };

            const handleCancelMfa = async () => {
                setMfaBusy(true);
                try { await cancelMfa(); }
                finally { setMfaBusy(false); setMfaCode(''); setPassword(''); }
            };

            return (
                <main className="login-page min-h-screen flex items-center justify-center px-4 py-8">
                    <div className="login-content w-full max-w-md">
                        <div className="login-bg-circle login-bg-one" aria-hidden="true" />
                        <div className="login-bg-circle login-bg-two" aria-hidden="true" />
                        <div className="login-bg-circle login-bg-three" aria-hidden="true" />
                        <Card className="login-card auth-wrapper" noPadding>
                            <div className="login-card-content">
                                <div className="login-heading text-center">
                                    <div className="login-brand-mark" aria-hidden="true"><Icons.HeartPulse size={28} /></div>
                                    <p className="login-eyebrow">Secure care operations</p>
                                    <h1>OneMed EMR</h1>
                                    <p className="login-subtitle">Hospital Management System</p>
                                </div>
                            <form onSubmit={handleSubmit} className="space-y-5">
                                {error && (
                                    <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-800">
                                        <Icons.AlertCircle size={16} />
                                        {error}
                                    </div>
                                )}
                                {passwordSetupMode ? (
                                    <div className="space-y-4">
                                        <div>
                                            <h2 className="text-lg font-semibold text-slate-900">{recoveryMode ? 'Reset your OneMed password' : 'Accept your OneMed invitation'}</h2>
                                            <p className="mt-1 text-sm text-slate-600">{email ? `${recoveryMode ? 'Choose a new password for' : 'Set a password for'} ${email}.` : recoveryMode ? 'Choose a new password for your OneMed account.' : 'Set a password to finish setting up your account.'}</p>
                                        </div>
                                        {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>}
                                        {inviteLinkError ? <><p role="status" className="text-sm text-slate-600">Ask your Super Admin to send a fresh invitation or password reset email, then use the newest link.</p><Button type="button" variant="ghost" className="w-full justify-center" onClick={() => { setInviteMode(false); setRecoveryMode(false); setInviteLinkError(''); setError(''); }}>Return to sign in</Button></> : !inviteSessionChecked ? <p role="status" className="text-sm text-slate-600">Checking your {recoveryMode ? 'password reset' : 'invitation'} link…</p> : !inviteSessionReady ? <p role="status" className="text-sm text-slate-600">A valid {recoveryMode ? 'password reset' : 'invitation'} session is required to continue.</p> : <>
                                            <label className="block text-sm font-medium text-slate-700">New password
                                                <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm" required />
                                            </label>
                                            <p className="-mt-2 text-xs text-slate-600">At least 12 characters, including uppercase and lowercase letters, a number, and a symbol.</p>
                                            <label className="block text-sm font-medium text-slate-700">Confirm password
                                                <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm" required />
                                            </label>
                                            {!recoveryMode && <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" className="mt-0.5" checked={noticeAccepted} onChange={(event) => setNoticeAccepted(event.target.checked)} /><span>I have reviewed the <a className="text-medical-700 underline" href="/privacy-notice.html" target="_blank" rel="noreferrer">draft privacy notice</a> and <a className="text-medical-700 underline" href="/terms.html" target="_blank" rel="noreferrer">draft terms</a>. They are pending facility legal review.</span></label>}
                                            <Button type="button" variant="primary" size="lg" className="w-full justify-center" onClick={handleInvitePassword} disabled={invitePasswordBusy} aria-busy={invitePasswordBusy}>
                                                {invitePasswordBusy ? 'Saving password…' : recoveryMode ? 'Save new password' : 'Accept invitation and set password'}
                                            </Button>
                                        </>}
                                    </div>
                                ) : mfaGate ? (
                                    <div className="space-y-4">
                                        <div>
                                            <h2 className="text-lg font-semibold text-slate-900">{mfaGate.mode === 'challenge' ? 'Verify your authenticator' : 'Set up an authenticator'}</h2>
                                            <p className="mt-1 text-sm text-slate-600">This account must complete two-step verification before entering OneMed.</p>
                                        </div>
                                        {mfaGate.error && <p role="status" className="text-sm text-amber-800">{mfaGate.error}</p>}
                                        {mfaGate.mode === 'enroll' && !mfaGate.qrCode ? (
                                            <Button type="button" variant="primary" className="w-full justify-center" onClick={handleBeginMfaEnrollment} disabled={mfaBusy}>
                                                {mfaBusy ? 'Preparing setup...' : 'Set up authenticator'}
                                            </Button>
                                        ) : (
                                            <>
                                                {mfaGate.mode === 'enroll' && mfaGate.qrCode && <div className="space-y-2 rounded-lg border border-slate-200 p-4">
                                                    <p className="text-sm text-slate-700">Scan this QR code with an authenticator app, then enter the current code below.</p>
                                                    <img className="mx-auto h-48 w-48" src={mfaGate.qrCode} alt="One-time authenticator setup QR code" />
                                                    {mfaGate.secret && <p className="break-all text-xs text-slate-600">Manual setup key: <code>{mfaGate.secret}</code></p>}
                                                </div>}
                                                <Input label="Authenticator code" type="text" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} required />
                                                <Button type="submit" variant="primary" size="lg" className="w-full justify-center" disabled={mfaBusy} aria-busy={mfaBusy}>
                                                    {mfaBusy ? 'Verifying...' : 'Verify and continue'}
                                                </Button>
                                            </>
                                        )}
                                        <Button type="button" variant="ghost" className="w-full justify-center" onClick={handleCancelMfa} disabled={mfaBusy}>Sign out</Button>
                                        <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" className="mt-0.5" checked={noticeAccepted} onChange={(event) => setNoticeAccepted(event.target.checked)} /><span>I have reviewed the <a className="text-medical-700 underline" href="/privacy-notice.html" target="_blank" rel="noreferrer">draft privacy notice</a> and <a className="text-medical-700 underline" href="/terms.html" target="_blank" rel="noreferrer">draft terms</a>. They are pending facility legal review.</span></label>
                                    </div>
                                ) : <>
                                <Input
                                    label="Email"
                                    placeholder="Enter your email"
                                    type="email"
                                    autoComplete="username"
                                    inputMode="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    icon={Icons.Mail}
                                    className="login-email-field login-field"
                                    required
                                />
                                <div className="-mt-2 text-xs text-slate-600">Use the email and password for your hospital account.</div>
                                <div className="login-field">
                                    <label htmlFor="onemed-login-password" className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                                    <div className="relative">
                                        <input
                                            id="onemed-login-password"
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete="current-password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter your password"
                                            className="w-full rounded-lg border border-slate-300 focus:border-medical-500 focus:ring-2 focus:ring-medical-200 focus:ring-opacity-50 outline-none transition-all pl-4 pr-12 py-2.5 text-sm"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                            aria-pressed={showPassword}
                                            className="password-toggle absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                                        >
                                            <Icons.Eye size={18} />
                                        </button>
                                    </div>
                                </div>
                                <Button type="submit" variant="primary" size="lg" className="w-full justify-center" disabled={loading} aria-busy={loading}>
                                    {loading ? (
                                        <span className="flex items-center gap-2" role="status" aria-live="polite">
                                            <Icons.RefreshCw size={18} className="animate-spin" />
                                            Signing in...
                                        </span>
                                    ) : 'Sign In'}
                                </Button>
                                <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" className="mt-0.5" checked={noticeAccepted} onChange={(event) => setNoticeAccepted(event.target.checked)} /><span>I have reviewed the <a className="text-medical-700 underline" href="/privacy-notice.html" target="_blank" rel="noreferrer">draft privacy notice</a> and <a className="text-medical-700 underline" href="/terms.html" target="_blank" rel="noreferrer">draft terms</a>. They are pending facility legal review.</span></label>
                                <div id="onemed-turnstile-widget" className="flex justify-center" aria-label="CAPTCHA verification" />
                                {captchaError && <p role="status" className="text-center text-xs text-red-700">{captchaError}</p>}
                                </>}
                            </form>
                            </div>
                        </Card>
                        <p className="login-footer mt-5 text-center text-sm"><a href="/refund-policy.html">Refund policy</a><span aria-hidden="true">·</span><a href="/privacy-notice.html">Privacy notice</a><span aria-hidden="true">·</span><a href="/terms.html">Terms</a></p>

                    </div>
                </main>
            );
        };

export { AuthContext, aal2RequiredRoles, canonicalModuleKeys, legacyPermissionAliases, routeModulePermissions, normalizeRoleMatrix, defaultRoleMatrix, AuthProvider, useAuth, LoginPage };
